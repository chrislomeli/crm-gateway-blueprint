/**
 * HubSpot Webhook Processing Service
 *
 * This is the core service that processes arrays of HubSpot webhook events with concurrency control
 * to extract AI-driven intent signals from contact property changes. It serves as the main orchestrator
 * in the webhook processing pipeline.
 *
 * ROLE IN OVERALL FLOW:
 * 1. Receives SQS messages containing arrays of HubSpot webhook events
 * 2. Processes multiple events concurrently using p-limit for controlled throughput
 * 3. Validates and converts webhook events to internal format
 * 4. Delegates to MessageProcessor for intent processing and other in-stream actions
 * 5. Aggregates results from batch processing (fail-fast: any failure fails the batch)
 *
 * KEY COMPONENTS:
 * - Batch Processing: Handles arrays of events with concurrency control
 * - MessageProcessor Integration: Delegates to handleIntentUpdate for intent processing
 * - Result Aggregation: Combines individual results into single WorkerResult
 * - Error Handling: Uses fail-fast strategy for batch processing
 *
 * PROCESSING SCENARIOS:
 * - Batch webhook events: Processes multiple events concurrently with p-limit
 * - Individual event processing: Each event processed through standard pipeline
 * - Future extensibility: Ready for additional in-stream actions beyond intents
 *
 * ERROR HANDLING:
 * Uses Result pattern throughout for consistent error handling and logging.
 * Batch fails if any individual event fails (requeue entire message).
 * All major steps include milestone logging for traceability.
 */

import {AppErrorType, failure, isFailure, noop, Result, success, logger, getErrorInfo} from '@platform/core';
import {ObservabilityFactory, SpanStatus} from '@platform/infrastructure';

import {MessageContext, MessageProcessor, WorkerResult} from "@platform/services";
import {z} from "zod";
import {IntentService} from "./intent";
import {IntentsCache} from "./cache";
import {HubspotSQSWebhookMessage, HubspotUpdateEvent} from "../types/webhook.types";


// Interface for SQS message structure
export type SqsHubspotMessage = HubspotUpdateEvent[];

// flags
const RUN_PARALLEL = false;


// Zod schema for validating critical HubspotUpdateEvent fields
const HubspotUpdateEventValidator = z.object({
    portalId: z.number().positive('portalId must be a positive number'),
    objectId: z.number().positive('objectId must be a positive number'),
    eventSpanId: z
        .string()
        .min(26, 'must have a valid span (ulid) id == 26 chars'),
    subscriptionType: z
        .string()
        .startsWith('contact', 'subscriptionType must start with "contact"'),
    propertyName: z.string().min(1, 'propertyName must be a non-empty string'),
    propertyValue: z
        .any()
        .refine(
            (val) => val !== null && val !== undefined,
            'propertyValue must be defined and not null',
        ),
});

// Zod schema for validating the message body structure
const HubspotSQSWebhookMessageValidator = z.object({
    portalId: z.number().positive('portalId must be a positive number'),
    objectId: z.number().positive('objectId must be a positive number'),
    contactEvents: z.array(z.any()).min(1, 'contactEvents array must not be empty'),
});

/**
 * Initialize the intent cache with business intents from database
 * This should be called once per Lambda container lifecycle
 *
 * @returns Promise<IntentsCacheInterface | null> - Initialized cache or null on failure
 */
async function initializeIntentCache(): Promise<IntentsCache | null> {
    try {
        logger.debug('Initializing intent cache...');

        // Initialize cache with JIT initialization (no manual setup needed)
        const intentCache = new IntentsCache();
        logger.debug('🚀 Intent cache created with JIT initialization enabled');

        return intentCache;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'Failed to initialize intent cache');
        return null;
    }
}


/**
 * SQS Webhook Message Processor
 * implements the process method from the MessageProcessor interface
 * receives messages from the poller
 *
 */
export class HubspotIntentProcessor implements MessageProcessor {
    private intentService: IntentService;

    /**
     * Creates a new ContactUpdatesSubscriber
     * @param cache
     */
    constructor() {
        this.intentService = new IntentService();
    }

    /**
     * Process an SQS message containing many messages
     *
     * This is the main entry point for processing webhook events. It validates the message
     * structure, extracts HubSpot event data array, and processes them with concurrency control.
     *
     * @param message - SQS message containing array of HubSpot events
     * @returns Promise<WorkerResult> - Processing result
     * @sideEffects
     *   - Logs milestone events for traceability
     *   - May trigger database writes and API calls via processOneMessage

     *
     *
     */
    async process(message: MessageContext<HubspotSQSWebhookMessage>): Promise<WorkerResult> {

        // Contact-level tracing: Trace the entire contact intent processing using contactTraceId
        const tracer = ObservabilityFactory.getTracingProvider().getTracer('intent-subscriber');
        const span = tracer.startSpan('intent-subscriber.processContact');
        
        span.setAttributes({
            'service.name': 'intent-subscriber',
            'operation.name': 'processContact',
            'business.contact_trace_id': message.body.contactTraceId,
            'business.portal_id': message.body.portalId,
            'business.object_id': message.body.objectId,
            'message.id': message.messageId,
            'contact.subscription_type': message.body.subscriptionType,
            'contact.entity_type': message.body.entity,
            'contact.operation_type': message.body.type,
            'contact.event_count': message.body.eventCount,
            'contact.queue_type': message.body.queueType
        });

        try {
            logger.debug({
                message,
                contactTraceId: message.body.contactTraceId
            }, '+++ ENTER PROCESS +++');

        // Validate message body structure using Zod
        const validationResult = HubspotSQSWebhookMessageValidator.safeParse(message.body);
        
            if (!validationResult.success) {
                const errorInfo = getErrorInfo(validationResult);
                logger.warn({
                    messageId: message.messageId,
                    validationErrors: errorInfo.errors,
                    messageBody: message.body
                }, '⚠️ Skipping message: Invalid message structure');
                
                // Noop outcome - message was skipped due to validation
                span.setStatus(SpanStatus.OK);
                span.addEvent('operation_noop', { reason: 'Invalid message structure - message skipped' });
                span.setAttributes({
                    'result.outcome': 'noop',
                    'result.reason': 'invalid_message_structure'
                });
                
                return success({ 
                    status: 'skipped', 
                    reason: 'invalid_message_structure',
                    errors: errorInfo.errors
                });
            }

        // Extract validated fields
        const { contactEvents: hubspotUpdateEvents, portalId, objectId } = validationResult.data;

        // todo - verify that all the objectIds are the same and equal objectId



        // filter for just events where the subscriptionType starts with  'contact',
        const contactEvents = hubspotUpdateEvents.filter(event => event.subscriptionType.startsWith('contact'));

        // filter for just events where the subscriptionType starts with  'deal',
        const dealEvents = hubspotUpdateEvents.filter(event => event.subscriptionType.startsWith('deal'));

        // handle contact updates
        if (contactEvents && contactEvents?.length || 0 > 0) {
            await this.handleIntentUpdates(portalId, objectId, contactEvents);
        }


            const result = {
                success: true,
                outcome: {
                    contactEvents: contactEvents.length,
                    dealEvents: dealEvents.length,
                }
            };

            // Determine trace outcome based on processing results
            let traceOutcome: string;
            const totalEventsProcessed = contactEvents.length + dealEvents.length;
            
            if (totalEventsProcessed === 0) {
                traceOutcome = 'noop';
                span.addEvent('operation_noop', { reason: 'No contact or deal events to process for intents' });
            } else {
                traceOutcome = 'success';
            }
            
            span.setStatus(SpanStatus.OK);
            span.setAttributes({
                'result.outcome': traceOutcome,
                'result.contact_events_processed': contactEvents.length,
                'result.deal_events_processed': dealEvents.length,
                'result.total_events_processed': totalEventsProcessed
            });

            logger.debug({
                messageId: message.messageId,
                result: result.outcome,
                contactTraceId: message.body.contactTraceId
            }, '🎉 Intent processing completed successfully');

            return result;
            
        } catch (error) {
            // Failed outcome
            span.setStatus(SpanStatus.ERROR, 'Contact intent processing failed');
            span.recordException(error as Error);
            span.setAttributes({
                'result.outcome': 'failed',
                'error.type': 'processing_exception'
            });
            
            logger.error({ 
                messageId: message.messageId,
                contactTraceId: message.body.contactTraceId,
                error: getErrorInfo(error)
            }, '❌ Intent processing failed');
            
            throw error;
        } finally {
            span.end();
        }

    }


    /**
     * handle Intent updates
     */
    async handleIntentUpdates(portalId: number, objectId: number, hubspotUpdateEvents: HubspotUpdateEvent[]) {
        logger.debug({ hubspotUpdateEvents }, '** handleIntentUpdates **');

        // filter out any that do not have a property or 'contact' type


        /**
         * Process each event individually, skipping invalid ones
         */
        for (const [index, hubspotEvent] of hubspotUpdateEvents.entries()) {
            const validatedEvent = HubspotUpdateEventValidator.safeParse(hubspotEvent);
            
            if (!validatedEvent.success) {
                const errorInfo = getErrorInfo(validatedEvent);
                logger.warn({
                    portalId: hubspotEvent.portalId,
                    objectId: hubspotEvent.objectId,
                    eventIndex: index,
                    validationErrors: errorInfo.errors,
                    event: hubspotEvent
                }, '⚠️ Skipping invalid HubspotUpdateEvent');
                continue; // Skip this invalid event and move to the next one
            }

            // Process the validated event
            await this.intentService.dispatchAIOEvent(hubspotEvent);
        }

        return {
            success: true,
            outcome: [],
            retryable: false
        };

    }


    /**
     * Process a single HubSpot umessage - each
     *
     * Coordinates the processing of a HubSpot webhook event by delegating to
     * performInStreamActions. Acts as a wrapper with error handling.
     *
     * @param updateEvent - HubSpot update event in internal format
     * @returns Promise<Result<unknown>> - Processing result
     * @sideEffects
     *   - Logs processing start milestone
     *   - May trigger database writes and API calls via downstream methods
     */
    async processHubspotUpdateEvent(
        updateEvent: HubspotUpdateEvent,
    ): Promise<Result<unknown>> {
        try {
            logger.info({
                portalId: updateEvent.portalId,
                objectId: updateEvent.objectId,
                subscriptionType: updateEvent.subscriptionType,
                propertyName: updateEvent.propertyName,
                changeSource: updateEvent.changeSource,
                eventId: updateEvent.eventId,
            }, 'Processing HubSpot update event');

            /**
             * Filter out any that do not have elements care about
             */
            const validatedEvent =
                    HubspotUpdateEventValidator.safeParse(updateEvent);
            if (!validatedEvent.success) {
                logger.debug({ validationError: validatedEvent.error }, 'NOOP - Invalid HubspotUpdateEvent for intents');
                return noop();
            }


            // Ok perform intents worl=



            return success({
                success: true,})



        } catch (error) {
            logger.error({ error: getErrorInfo(error) }, 'Error processing single record');
            return failure({
                message: `Processing failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                type: AppErrorType.INTERNAL_ERROR,
                cause: error,
            });
        }
    }

}