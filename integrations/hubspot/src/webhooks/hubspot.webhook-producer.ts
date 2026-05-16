// hubspot-webhook-processor.ts
import { ulid } from 'ulid';
import { DateTime } from 'luxon';
import { SQSService } from '@platform/services';
import { getErrorInfo, generateContactTraceId, generateEventSpanId, logger } from '@platform/core';
import { ConfigProvider, CONFIG } from '@platform/configuration';
import { ObservabilityFactory, SpanStatus } from '@platform/infrastructure';
import { HubspotSQSWebhookMessage, HubspotUpdateEvent } from '../types';


type QueueType = 'import' | 'single';

// Grouping structure: portalId -> objectId -> subscriptionType -> queueType -> events
type EventsByQueueType = Record<QueueType, HubspotUpdateEvent[]>;
type EventsBySubscriptionType = Record<string, EventsByQueueType>;
type EventsByObjectId = Record<number, EventsBySubscriptionType>;
type EventsByPortalId = Record<number, EventsByObjectId>;

export class HubspotWebhookProcessor {
    private importQueueUrl: string | null = null;
    private singleQueueUrl: string | null = null;
    private intentQueueUrl: string | null = null;
    private queueUrlsResolved = false;

    constructor() {
        // Queue URLs will be resolved JIT when needed
    }

    /**
     * Resolve queue URLs from configuration using AWS SQS service
     * This is called JIT since SQSService.getQueueUrl() is async
     */
    private async resolveQueueUrls(): Promise<void> {
        if (this.queueUrlsResolved) {
            return; // Already resolved
        }

        try {
            // Get queue names from configuration
            const hubspotConfig = ConfigProvider.get(CONFIG.SHARED_SQS_HUBSPOT);
            if (!hubspotConfig) {
                throw new Error('HubSpot SQS configuration not found at shared.sqs.hubspot');
            }

            logger.info({ hubspotConfig }, 'Resolving HubSpot queue URLs from configuration');

            // Look up queue URLs using AWS SQS service
            const [importResult, singleResult, intentResult] = await Promise.all([
                SQSService.getQueueUrl(hubspotConfig.webhookImportQueueName),
                SQSService.getQueueUrl(hubspotConfig.webhookSingleQueueName),
                SQSService.getQueueUrl(hubspotConfig.intentQueueName)
            ]);

            logger.info( importResult,  'Resolved importResult queue URLs');
            logger.info( singleResult, 'Resolved singleResult queue URLs');
            logger.info( intentResult, 'Resolved intentResult queue URLs');

            // Check all results succeeded
            if (!importResult.success) {
                throw new Error(`Failed to resolve import queue URL: ${importResult.error}`);
            }
            if (!singleResult.success) {
                throw new Error(`Failed to resolve single queue URL: ${singleResult.error}`);
            }
            if (!intentResult.success) {
                throw new Error(`Failed to resolve intent queue URL: ${intentResult.error}`);
            }

            // Store resolved URLs
            this.importQueueUrl = importResult.data;
            this.singleQueueUrl = singleResult.data;
            this.intentQueueUrl = intentResult.data;
            this.queueUrlsResolved = true;

            // Log what we got
            logger.info({importQueueUrl: this.importQueueUrl}, '✅ importQueueUrl queue URLs resolved successfully');
            logger.info({singleQueueUrl: this.singleQueueUrl}, '✅ singleQueueUrl queue URLs resolved successfully');
            logger.info({intentQueueUrl: this.intentQueueUrl}, '✅ intentQueueUrl queue URLs resolved successfully');


        } catch (error) {
            const errorInfo = getErrorInfo(error);
            logger.error({ error: errorInfo }, '❌ Failed to resolve HubSpot queue URLs');
            throw error;
        }
    }

    async processAndSendWebhookBatch(events: HubspotUpdateEvent[]): Promise<{
        success: boolean;
        messagesProcessed: number;
        errors?: string[];
    }> {
        try {
            // Ensure queue URLs are resolved before processing
            await this.resolveQueueUrls();
            // Use existing parentTraceId if present, otherwise generate new one
            const existingTraceId = events.find(e => e.parentTraceId)?.parentTraceId;
            const parentTraceId = existingTraceId || ulid();
            console.log('Using parentTraceId:', parentTraceId, existingTraceId ? '(preserved from event)' : '(generated new)');

            // Group the events
            const grouped = this.groupEvents(events);

            let messagesProcessed = 0;
            const errors: string[] = [];

            // Process each grouped message
            for (const [portalIdStr, portalData] of Object.entries(grouped)) {
                const portalId = parseInt(portalIdStr, 10);

                for (const [objectIdStr, objectData] of Object.entries(portalData)) {
                    const objectId = parseInt(objectIdStr, 10);

                    for (const [subscriptionType, queueTypeData] of Object.entries(objectData)) {
                        for (const [queueType, contactEvents] of Object.entries(queueTypeData)) {
                            if (contactEvents.length === 0) continue;

                            // Enrich events with tracing (preserve existing trace IDs)
                            const enrichedEvents = contactEvents.map(event => ({
                                ...event,
                                parentTraceId: event.parentTraceId || parentTraceId,
                                eventSpanId: event.eventSpanId || generateEventSpanId()
                            }));

                            // Generate contactTraceId for this contact
                            const contactTraceId = generateContactTraceId();
                            
                            // Build message matching original structure
                            const message: HubspotSQSWebhookMessage = {
                                parentTraceId,
                                contactTraceId,
                                portalId,
                                objectId,
                                subscriptionType,
                                entity: this.getEntityType(subscriptionType),
                                type: this.getOperationType(subscriptionType),
                                contactEvents: enrichedEvents,
                                eventCount: enrichedEvents.length,
                                queueType: queueType as QueueType
                            };

                            // Contact-level tracing: Trace each contact message creation and sending
                            const tracer = ObservabilityFactory.getTracingProvider().getTracer('simple-publisher');
                            const span = tracer.startSpan('simple-publisher.processContact');
                            
                            span.setAttributes({
                                'service.name': 'simple-publisher',
                                'operation.name': 'processContact',
                                'business.contact_trace_id': contactTraceId,
                                'business.portal_id': portalId,
                                'business.object_id': objectId,
                                'contact.subscription_type': subscriptionType,
                                'contact.entity_type': message.entity,
                                'contact.operation_type': message.type,
                                'contact.event_count': enrichedEvents.length,
                                'contact.queue_type': queueType
                            });

                            try {
                                // Send to appropriate queue
                                if (queueType === 'import') {
                                    await this.sendToHubSpotImportQueue(message);
                                } else {
                                    await this.sendToHubSpotSingleQueue(message);
                                }
                                
                                // Success outcome
                                span.setStatus(SpanStatus.OK);
                                span.setAttributes({
                                    'result.outcome': 'success',
                                    'result.queue_sent': queueType
                                });
                                
                                messagesProcessed++;
                                
                            } catch (error) {
                                // Failed outcome
                                span.setStatus(SpanStatus.ERROR, 'Failed to send contact message to SQS');
                                span.recordException(error as Error);
                                span.setAttributes({
                                    'result.outcome': 'failed',
                                    'error.type': 'sqs_send_failure'
                                });
                                
                                const errorMsg = `Failed to send message for ${portalId}/${objectId}: ${error}`;
                                console.error(errorMsg);
                                errors.push(errorMsg);
                            } finally {
                                span.end();
                            }
                        }
                    }
                }
            }

            return {
                success: errors.length === 0,
                messagesProcessed,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            console.error('Error processing webhook batch:', error);
            return {
                success: false,
                messagesProcessed: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }

    public groupEvents(events: HubspotUpdateEvent[]): EventsByPortalId {
        const grouped: EventsByPortalId = {};

        events.forEach(event => {
            const { portalId, objectId, subscriptionType, changeSource } = event;

            // Determine queue type based on changeSource
            const queueType: QueueType = changeSource === 'IMPORT' ? 'import' : 'single';

            // Initialize nested structure as needed
            if (!grouped[portalId]) {
                grouped[portalId] = {};
            }

            if (!grouped[portalId][objectId]) {
                grouped[portalId][objectId] = {};
            }

            if (!grouped[portalId][objectId][subscriptionType]) {
                grouped[portalId][objectId][subscriptionType] = {
                    import: [],
                    single: []
                };
            }

            grouped[portalId][objectId][subscriptionType][queueType].push(event);
        });

        return grouped;
    }

    private async sendToHubSpotImportQueue(message: HubspotSQSWebhookMessage): Promise<void> {
        if (!this.importQueueUrl) {
            throw new Error('Import queue URL not resolved');
        }

        logger.debug({ message }, 'Sending message to HubSpot import queue');

        const result = await SQSService.sendMessage({
            queueUrl: this.importQueueUrl,
            messageBody: JSON.stringify(message),
            messageAttributes: {
                Type: {
                    DataType: 'String',
                    StringValue: 'hubspotImport'
                }
            }
        });

        if (!result.success) {
            const errorInfo = getErrorInfo(result);
            throw new Error(`Failed to send message to import queue: ${errorInfo.message || JSON.stringify(errorInfo)}`);
        }

        logger.info({ messageId: result.data?.MessageId, queueUrl: this.importQueueUrl }, 'Message sent to HubSpot import queue successfully');
    }

    private async sendToHubSpotSingleQueue(message: HubspotSQSWebhookMessage): Promise<void> {
        if (!this.singleQueueUrl) {
            throw new Error('Single queue URL not resolved');
        }

        logger.debug({ message }, 'Sending message to HubSpot single queue');

        const result = await SQSService.sendMessage({
            queueUrl: this.singleQueueUrl,
            messageBody: JSON.stringify(message),
            messageAttributes: {
                Type: {
                    DataType: 'String',
                    StringValue: 'hubspotSingle'
                }
            }
        });

        if (!result.success) {
            const errorInfo = getErrorInfo(result);
            throw new Error(`Failed to send message to single queue: ${errorInfo.message || JSON.stringify(errorInfo)}`);
        }

        logger.info({ messageId: result.data?.MessageId, queueUrl: this.singleQueueUrl }, 'Message sent to HubSpot single queue successfully');
    }

    private getEntityType(subscriptionType: string): string {
        if (subscriptionType.includes('contact')) return 'contact';
        if (subscriptionType.includes('deal')) return 'deal';
        if (subscriptionType.includes('company')) return 'company';
        return 'unknown';
    }

    private getOperationType(subscriptionType: string): string {
        if (subscriptionType.includes('creation')) return 'new';
        if (subscriptionType.includes('deletion')) return 'delete';
        if (subscriptionType.includes('propertyChange')) return 'modified';
        return 'unknown';
    }
}