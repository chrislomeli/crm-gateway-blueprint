/**
 * Vitest test for MessageProcessor.process() method
 * Uses real data from batch examples to test the new HubspotSQSWebhookMessage format
 */
import {beforeEach, describe, expect, it} from 'vitest';
import {ulid} from 'ulid';
import {HubspotWebhookConsumer} from './hubspot.webhook-consumer';
import {MessageContext} from '@platform/services';
import {ConfigProvider} from "@platform/configuration";
import {HubspotSQSWebhookMessage} from "../types/webhook.types";
import path from "path";


// Force production AWS configuration for tests (uses normal AWS credentials chain)
process.env.NODE_ENV = 'dev';
process.env.AWS_REGION = 'us-west-2';
// No AWS_ENDPOINT_URL - will use normal AWS credentials chain

describe('HubspotWebhookConsumer', () => {
    let webhookService: HubspotWebhookConsumer

    beforeEach(async () => {


            const config = await ConfigProvider.initialize({
                configFolder: path.resolve(__dirname, '../../../../config'),
            })

            webhookService = new HubspotWebhookConsumer();
        },
        3000000); // 30 second timeout for AWS calls

    it('should process HubspotSQSWebhookMessage with real batch data', async () => {
        // Set very long timeout for debugging/stepping through code
        //   vi.setConfig({ testTimeout: 300000 }); // 5 minutes

        // Using real data from webhook-events-batch-001-2025-08-08T02-47-43-361Z.json
        // This is the first event from your batch file, transformed to new format

        const testPayload: HubspotSQSWebhookMessage = {
            parentTraceId: '01HF3ZQWBJMSFAVZ6QMTFH2P6X', // batch trace id
            contactTraceId: '01HF3ZQWBJMSFAVZ6QMTFH2P6X', // batch trace id
            portalId: 20564323, // Real portalId from your data
            objectId: 5355551, // Real objectId from your data
            subscriptionType: 'contact.propertyChange',
            contactEvents: [
                {
                    eventId: 'e41002c1-c588-4100-84c0-79fdb1018125', // Real eventId from your data
                    subscriptionType: 'contact.propertyChange',
                    portalId: 20564323,
                    objectId: 5355551,
                    propertyName: 'intent-name-21594',
                    propertyValue: '{"intent_score":90,"intent_trigger":true,"context_summary":"High engagement detected","context_description":"Contact has shown significant interest in product demos","timestamp":"2025-08-08T01:22:31.890Z","source":"ai_model_v2","version":"1.0"}',
                    changeSource: '{"businessid":"21594","acmeowner":128352,"phones":1}',
                    occurredAt: 1754614185191,
                    eventSpanId: ulid() // Generate unique span ID for tracing
                }
            ],
            eventCount: 0,
            queueType: 'import',
            entity: 'contact',
            type: 'contact'
        };


        // Create MessageContext to simulate SQS message without actual SQS
        const messageContext: MessageContext<HubspotSQSWebhookMessage> = {
            messageId: 'test-message-id-' + ulid(),
            body: testPayload,
            raw: {}
        };


        const result = await webhookService.process(messageContext);

        // Verify the result structure
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.outcome).toBeDefined();

        // Verify it processed the contact events
        if (typeof result.outcome === 'object' && result.outcome !== null) {
            expect(result.outcome).toHaveProperty('contactEvents');
            expect((result.outcome as any).contactEvents).toBe(1);
            expect((result.outcome as any).dealEvents).toBe(0);
        }

        console.log('✅ Test completed successfully');
        console.log('📊 Result:', JSON.stringify(result, null, 2));
    });


}, 999999999);
