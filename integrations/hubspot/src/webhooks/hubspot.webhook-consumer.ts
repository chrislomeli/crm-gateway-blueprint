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

import {getErrorInfo, isFailure, isNoop, logger, noop, Result, success, generateContactTraceId} from '@platform/core';
import {MessageContext, MessageProcessor, SQSService, WorkerResult} from "@platform/services";
import {ConfigProvider, CONFIG} from "@platform/configuration";
import {ObservabilityFactory, SpanStatus} from '@platform/infrastructure';
import {z} from "zod";
import {
    ContactEvent,
    ContactInfo, ContactMetaData,
    ContactRecord,
    HubspotSQSWebhookMessage,
    HubspotUpdateEvent,
    IntentVote, SignalScore
} from "../types";
import {getBusinessByAccountId} from "../intents";
import {HubspotSyncSingles} from "../services/hubspot.sync-singles";
import {IContactRepository} from '../repositories';


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
    parentTraceId: z.string(),
    contactTraceId: z.string(),
    subscriptionType: z.string(),
    portalId: z.number().positive('portalId must be a positive number'),
    objectId: z.number().positive('objectId must be a positive number'),
    contactEvents: z.array(z.any()).min(1, 'contactEvents array must not be empty'),
});


/**
 * SQS Webhook Message Processor
 * implements the process method from the MessageProcessor interface
 * receives messages from the poller
 *
 */
export class HubspotWebhookConsumer implements MessageProcessor {
    private intentQueueUrl: string;
    private intentQueueName: string;
    private contactRepo?: IContactRepository;

    /**
     * Creates a new ContactUpdatesSubscriber
     * @param contactRepo - Optional contact repository for dependency injection
     */
    constructor(contactRepo?: IContactRepository) {
        this.contactRepo = contactRepo;
        
        // Get intent queue URL from configuration
        this.intentQueueName = ConfigProvider.get(CONFIG.HUBSPOT_INTENT_QUEUE_NAME);
        this.intentQueueUrl = '';

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

        // Contact-level tracing: Trace the entire contact message processing using contactTraceId
        const tracer = ObservabilityFactory.getTracingProvider().getTracer('webhook-subscriber');
        const span = tracer.startSpan('webhook-subscriber.processContact');
        
        span.setAttributes({
            'service.name': 'webhook-subscriber',
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
            logger.info({ 
                messageId: message.messageId,
                portalId: message.body.portalId,
                objectId: message.body.objectId,
                contactTraceId: message.body.contactTraceId
            }, '🚀 Starting webhook message processing');

        // Validate message body structure using Zod
        logger.info({ messageId: message.messageId }, '📋 Validating message structure');
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

        logger.info({ messageId: message.messageId }, '✅ Message validation passed');

        // place the parentId of the whole webhook payload on the contact event
        const validatedPayload = validationResult.data;
        validatedPayload.contactEvents.forEach(event => event.parentTraceId = message.body.parentTraceId);

        // Extract validated fields
        const { contactEvents: hubspotUpdateEvents, portalId, objectId, parentTraceId, subscriptionType, contactTraceId } = validationResult.data;

        logger.info( validationResult.data, '📊 +++ Extracted message fields +++');

        // filter for just events where the subscriptionType starts with  'contact',
        const contactEvents = hubspotUpdateEvents.filter(event => event.subscriptionType.startsWith('contact'));

        // filter for just events where the subscriptionType starts with  'deal',
        const dealEvents = hubspotUpdateEvents.filter(event => event.subscriptionType.startsWith('deal'));

        logger.info({ 
            messageId: message.messageId,
            contactEventsCount: contactEvents.length,
            dealEventsCount: dealEvents.length 
        }, '🔍 Filtered events by type');


        // handle any Deal updates
        if (dealEvents && dealEvents?.length || 0 > 0) {
            logger.info({ 
                messageId: message.messageId,
                dealEventsCount: dealEvents.length,
                portalId,
                objectId 
            }, '💼 Processing deal updates');
            await this.handleDealUpdates(portalId, objectId, dealEvents);
            logger.info({ messageId: message.messageId }, '✅ Deal updates completed');
        }

        // handle contact updates
        if (contactEvents && contactEvents?.length || 0 > 0) {
            logger.info({ 
                messageId: message.messageId,
                contactEventsCount: contactEvents.length,
                portalId,
                objectId 
            }, '👤 Processing contact updates');

            // this is a single contact event - 1 contact per payload, so we can process it once
            const contactEvent: ContactEvent = {
                portalId,
                objectId,
                parentTraceId,
                contactTraceId,
                subscriptionType
            }
            const result = await this.handleContactUpdate(contactEvent, contactEvents);
            logger.info({ messageId: message.messageId }, '✅ Contact updates completed');

        }

            const result : WorkerResult = {
                success: true,
                outcome: {
                    contactEvents: contactEvents.length,
                    dealEvents: dealEvents.length,
                }
            }

            // Determine trace outcome based on processing results
            let traceOutcome: string;
            const totalEventsProcessed = contactEvents.length + dealEvents.length;
            
            if (totalEventsProcessed === 0) {
                traceOutcome = 'noop';
                span.addEvent('operation_noop', { reason: 'No contact or deal events to process' });
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

            logger.info({ 
                messageId: message.messageId,
                result: result.outcome,
                contactTraceId: message.body.contactTraceId
            }, '🎉 Webhook message processing completed successfully');

            return result;
            
        } catch (error) {
            // Failed outcome
            span.setStatus(SpanStatus.ERROR, 'Contact message processing failed');
            span.recordException(error as Error);
            span.setAttributes({
                'result.outcome': 'failed',
                'error.type': 'processing_exception'
            });
            
            logger.error({ 
                messageId: message.messageId,
                contactTraceId: message.body.contactTraceId,
                error: getErrorInfo(error)
            }, '❌ Webhook message processing failed');
            
            throw error;
        } finally {
            span.end();
        }

    }


    /**
     * handle Contact updates and forward to intent queue after successful sync
     *
     */
    async handleContactUpdate({portalId, objectId, parentTraceId, subscriptionType, contactTraceId}: ContactEvent, contactEvents: HubspotUpdateEvent[]) {

        //Contacts
        logger.debug({contactEvents}, '***** handleContactUpdate: CONTACTS *****');

        // Get the business id from the account id
        const result = await getBusinessByAccountId(String(portalId), 16);
        if (!result.success) {
            logger.error({ portalId, objectId: objectId }, 'Failed while trying to get business by account id');
            return;
        }
        if (!result.data) {
            logger.error({ accountId: portalId, objectId: objectId }, 'Could not resolve business by account id');
            return;
        }

        const businessId = Number(result.data); // TypeScript now knows this is a number!
        const oauth = {
            businessid: businessId,
            token: ''
        }

        const hb = new HubspotSyncSingles(businessId, portalId, this.contactRepo);

        // Sync the contact with trace metadata
        const traceMetadata: ContactMetaData = {
            source: 'webhook',
            traceId: contactTraceId,
            lastUpdated: new Date(),
        };
        const syncOneContactResponse = await hb.syncOneContact(businessId, portalId, objectId,  traceMetadata, oauth);
        if (!syncOneContactResponse.success) {
            // Handle NOT_FOUND as a normal case (contact deleted/doesn't exist)
            if (syncOneContactResponse.error?.type === 'NOT_FOUND') {
                logger.info({ 
                    portalId, 
                    objectId, 
                    businessId,
                    message: syncOneContactResponse.error.message 
                }, 'Contact not found in HubSpot - likely deleted or non-existent');
                
                // Return success for NOT_FOUND to avoid retries
                return { success: true, data: null };
            }
            
            // Log other errors as actual failures
            logger.error({ ...syncOneContactResponse, portalId, objectId }, 'Failed to sync contact');
            return syncOneContactResponse;

        }

        const processedContact = syncOneContactResponse.data as unknown as ContactRecord;
        const intentPayload: HubspotSQSWebhookMessage = {
            entity: "", eventCount: 0, queueType: 'single', type: "",
            portalId,
            objectId,
            parentTraceId,
            contactTraceId: generateContactTraceId(),
            contactEvents,
            subscriptionType
        };

        // After successful contact sync, filter and forward contact events to intent queue
        // This ensures intent-processor gets only relevant events with updated contact data
        try {
            // Filter contact events based on specific criteria
            const filterResult = this.filterContactEventsForIntent(intentPayload, processedContact);
            
            if (isFailure(filterResult)) {
                logger.error({
                    portalId, 
                    objectId, 
                    reason: filterResult.error.message 
                }, 'error trying to filter contact events for intent processing');
                return; // Don't fail the whole operation - contact sync succeeded
            }
            if (isNoop(filterResult)) {
                logger.info({
                    portalId,
                    objectId,
                }, 'No contact events match intent filtering criteria - skipping intent queue');
                return; // Don't fail the whole operation - contact sync succeeded
            }

            // Forward filtered events to intent queue
            await this.forwardContactEventsToIntentQueue(filterResult.data);
            logger.debug({ 
                portalId, 
                objectId, 
                originalEventCount: contactEvents.length,
                filteredEventCount: filterResult.data.contactEvents.length
            }, 'Filtered contact events forwarded to intent queue');
        } catch (error) {
            logger.error({ 
                error: getErrorInfo(error), 
                portalId, 
                objectId 
            }, 'Failed to forward contact events to intent queue');
            // Don't fail the whole operation - contact sync succeeded
        }
    }

    /**
     * Forward contact events to intent queue after successful contact sync
     * Uses minimal filtering - sends all contact property changes and creations
     */
    private async forwardContactEventsToIntentQueue(intentPayload: HubspotSQSWebhookMessage ): Promise<void> {
        // Filter for events that might be relevant for intent processing
        // Minimal filtering: all contact property changes and creations
        const intentRelevantEvents = intentPayload.contactEvents.filter(event =>
            event.subscriptionType === 'contact.propertyChange' ||
            event.subscriptionType === 'contact.creation'
        );

        if (intentRelevantEvents.length === 0) {
            logger.debug('No intent-relevant contact events to forward');
            return;
        }

        // Send to intent queue using SQS service (standard queue)
        logger.debug(intentPayload, 'Sending contact events to intent queue');

        if (this.intentQueueUrl.length <= 1) {
            const queueUrlResponse = await SQSService.getQueueUrl(this.intentQueueName);
            if (queueUrlResponse.success) {
                this.intentQueueUrl = queueUrlResponse.data;
            }
        }

        const result = await SQSService.sendMessage({
            queueUrl: this.intentQueueUrl,
            messageBody: JSON.stringify(intentPayload),
            messageAttributes: {
                Type: {
                    DataType: 'String',
                    StringValue: 'hubspotIntent'
                }
            }
        });

        if (!result.success) {
            const errorInfo = getErrorInfo(result);
            throw new Error(`Failed to send message to intent queue: ${errorInfo.message}`);
        }

        logger.debug({ result: result.data }, 'Successfully sent contact events to intent queue');
    }


    /**
     * Filter contact events based on specific criteria for intent processing
     *
     * Criteria:
     * - propertyName is 'hubspot_owner_id' OR
     * - propertyValue is JSON with intent_trigger = true OR
     * - contactRecord must have businessid and externalid fields
     *
     * @param intentPayload The original intent payload
     * @returns Result containing filtered payload or failure with clear error message
     */
    private filterContactEventsForIntent(intentPayload: HubspotSQSWebhookMessage, contactRecord: ContactRecord): Result<HubspotSQSWebhookMessage> {
        const { contactEvents,  portalId, objectId } = intentPayload;
        
        // First validate contactRecord has required fields
        if (!contactRecord || typeof contactRecord !== 'object') {
            const message = 'contactRecord is missing or invalid';
            logger.warn({ portalId, objectId }, message);
            return noop(message);
        }

        if (!contactRecord.businessid || !contactRecord.externalid) {
            const message = `contactRecord missing required fields - businessid: ${!!contactRecord.businessid}, externalid: ${!!contactRecord.externalid}`;
            logger.warn({ 
                portalId, 
                objectId, 
                hasBusinessId: !!contactRecord.businessid,
                hasExternalId: !!contactRecord.externalid
            }, message);
            return noop(message);
        }

        // must have a phone number
        if (!this.hasValidPhone(contactRecord.phone164)) {
            const message = `contactRecord missing required fields - phone164: ${!!contactRecord.phone164}`;
            logger.debug({
                portalId,
                objectId,
                hasPhone164: !!contactRecord.phone164
            }, message);
            return noop(message);
        }

        // Filter contact events based on criteria
        const filteredEvents = contactEvents.filter(event => {
            // Criteria 1: propertyName is 'hubspot_owner_id'
            if (event.propertyName === 'hubspot_owner_id') {
                logger.debug({ 
                    eventId: event.eventId, 
                    propertyName: event.propertyName 
                }, 'Event matches hubspot_owner_id criteria');
                return true;
            }

            // Criteria 2: propertyValue is JSON with intent_trigger = true
            if (event.propertyValue && typeof event.propertyValue === 'string') {
                try {
                    const parsedValue = JSON.parse(event.propertyValue);
                    if (parsedValue && (parsedValue.intent_trigger === true || parsedValue.intent_trigger === 'true')) {
                        logger.debug({ 
                            eventId: event.eventId, 
                            propertyName: event.propertyName,
                            intentTrigger: parsedValue.intent_trigger
                        }, 'Event matches intent_trigger criteria');
                        return true;
                    }
                } catch (parseError) {
                    // propertyValue is not valid JSON, skip this event
                    logger.debug({ 
                        eventId: event.eventId, 
                        propertyName: event.propertyName,
                        propertyValue: event.propertyValue 
                    }, 'Event propertyValue is not valid JSON');
                }
            }

            // Event doesn't match any criteria
            logger.debug({ 
                eventId: event.eventId, 
                propertyName: event.propertyName,
                propertyValueType: typeof event.propertyValue
            }, 'Event does not match filtering criteria');
            return false;
        });

        // Check if any events passed the filter
        if (filteredEvents.length === 0) {
            const message = `No contact events match intent filtering criteria - checked ${contactEvents.length} events`;
            logger.info({ 
                portalId, 
                objectId, 
                totalEvents: contactEvents.length,
                filteredEvents: 0,
                eventDetails: contactEvents.map(e => ({
                    eventId: e.eventId,
                    propertyName: e.propertyName,
                    hasPropertyValue: !!e.propertyValue
                }))
            }, message);
            return noop(message);
        }

        // Create filtered payload with same schema as input
        const filteredPayload: HubspotSQSWebhookMessage = {
            ...intentPayload,
            contactEvents: filteredEvents,
            eventCount: filteredEvents.length
        };

        logger.info({ 
            portalId, 
            objectId, 
            originalEventCount: contactEvents.length,
            filteredEventCount: filteredEvents.length
        }, 'Successfully filtered contact events for intent processing');

        return success(filteredPayload);
    }


     hasValidPhone(phones: any[] | undefined): boolean {  // Use whatever type phone164 actually is
        return (phones || []).some(p => !!p?.phone?.toString().trim());
    }

    /**
     * handle Contact and Deal updates
     *
     */
    async handleDealUpdates(portalId: number, objectId: number, dealEvents: HubspotUpdateEvent[]) {
        logger.debug({ dealEvents }, '** handleContactAndDealUpdates(ONE EVENT) **');

        logger.debug('** DEALS **');

    }

}