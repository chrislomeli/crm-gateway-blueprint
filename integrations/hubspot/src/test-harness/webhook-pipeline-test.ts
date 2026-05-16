#!/usr/bin/env node
/**
 * Webhook Pipeline Test Harness
 * 
 * Tests the complete webhook processing pipeline by sending test events
 * to LocalStack SQS queues and validating the flow.
 */

import {CONFIG, ConfigProvider} from '@platform/configuration';
import { logger } from '@platform/core';
import { HubspotWebhookProcessor } from '../webhooks';
import { HubspotUpdateEvent } from '../types';

interface TestResult {
    scenario: string;
    success: boolean;
    messagesProcessed: number;
    errors: string[];
    duration: number;
}

class WebhookPipelineTest {
    private processor: HubspotWebhookProcessor | null = null;

    async initialize(): Promise<void> {
        logger.info('🚀 Initializing Webhook Pipeline Test');
        
        // Initialize configuration
        await ConfigProvider.initialize();
        
        // Get queue configuration
        const localstackConfig = ConfigProvider.get(CONFIG.LOCALSTACK);
        const hubspotConfig = ConfigProvider.get(CONFIG.HUBSPOT_SQS_QUEUES);
        
        if (!localstackConfig || !hubspotConfig) {
            throw new Error('Missing LocalStack or HubSpot SQS configuration');
        }

        this.processor = new HubspotWebhookProcessor();

    }

    /**
     * Create test events with clean JSON propertyValues (new requirement)
     */
    private createCleanJsonEvents(): HubspotUpdateEvent[] {
        return [
            {
                eventId: "test-clean-json-1",
                subscriptionId: 1134901,
                portalId: 20564323,
                appId: 223929,
                occurredAt: Date.now(),
                subscriptionType: "contact.propertyChange",
                attemptNumber: 0,
                objectId: 4908352,
                propertyName: "intent-score",
                propertyValue: JSON.stringify({
                    intent_score: 95,
                    intent_trigger: true,
                    context_summary: "High engagement detected",
                    context_description: "Contact has shown significant interest in product demos",
                    timestamp: new Date().toISOString(),
                    source: "ai_model_v2",
                    version: "1.0"
                }),
                changeSource: "INTEGRATION"
            },
            {
                eventId: "test-clean-json-2",
                subscriptionId: 1134901,
                portalId: 20564323,
                appId: 223929,
                occurredAt: Date.now() + 1000,
                subscriptionType: "contact.propertyChange",
                attemptNumber: 0,
                objectId: 4908251,
                propertyName: "intent-score",
                propertyValue: JSON.stringify({
                    intent_score: 87,
                    intent_trigger: true,
                    context_summary: "Medium engagement detected",
                    context_description: "Contact has shown interest in pricing information",
                    timestamp: new Date().toISOString(),
                    source: "ai_model_v2",
                    version: "1.0"
                }),
                changeSource: "INTEGRATION"
            }
        ];
    }

    /**
     * Create test events with mixed changeSources
     */
    private createMixedSourceEvents(): HubspotUpdateEvent[] {
        return [
            {
                eventId: "test-integration-1",
                subscriptionId: 1134901,
                portalId: 6283166,
                appId: 223929,
                occurredAt: Date.now(),
                subscriptionType: "contact.propertyChange",
                attemptNumber: 0,
                objectId: 151201308050,
                propertyName: "firstname",
                propertyValue: "TestUser",
                changeSource: "INTEGRATION"
            },
            {
                eventId: "test-import-1",
                subscriptionId: 1134901,
                portalId: 6283166,
                appId: 223929,
                occurredAt: Date.now() + 1000,
                subscriptionType: "contact.propertyChange",
                attemptNumber: 0,
                objectId: 999888777,
                propertyName: "email",
                propertyValue: "imported@test.com",
                changeSource: "IMPORT"
            }
        ];
    }

    /**
     * Run a test scenario
     */
    private async runScenario(name: string, events: HubspotUpdateEvent[]): Promise<TestResult> {
        logger.info(`🧪 Running scenario: ${name}`);
        
        if (!this.processor) {
            throw new Error('Test not initialized');
        }

        const startTime = Date.now();
        
        try {
            const result = await this.processor.processAndSendWebhookBatch(events);
            const duration = Date.now() - startTime;
            
            logger.info(`✅ Scenario '${name}' completed: ${result.messagesProcessed} messages in ${duration}ms`);
            
            return {
                scenario: name,
                success: result.success,
                messagesProcessed: result.messagesProcessed,
                errors: result.errors || [],
                duration
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            logger.error(error,`❌ Scenario '${name}' failed:`);
            
            return {
                scenario: name,
                success: false,
                messagesProcessed: 0,
                errors: [errorMsg],
                duration
            };
        }
    }

    /**
     * Run all test scenarios
     */
    async runAllTests(): Promise<void> {
        logger.info('🎯 Starting webhook pipeline tests');
        
        const results: TestResult[] = [];
        
        // Test 1: Clean JSON events (new requirement)
        const cleanJsonEvents = this.createCleanJsonEvents();
        const cleanJsonResult = await this.runScenario('Clean JSON Intent Data', cleanJsonEvents);
        results.push(cleanJsonResult);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 2: Mixed source events (IMPORT vs INTEGRATION)
        const mixedSourceEvents = this.createMixedSourceEvents();
        const mixedSourceResult = await this.runScenario('Mixed Import and Integration', mixedSourceEvents);
        results.push(mixedSourceResult);
        
        // Generate report
        this.generateReport(results);
    }

    /**
     * Generate test report
     */
    private generateReport(results: TestResult[]): void {
        logger.info('\n' + '='.repeat(60));
        logger.info('📊 WEBHOOK PIPELINE TEST RESULTS');
        logger.info('='.repeat(60));
        
        const totalScenarios = results.length;
        const successfulScenarios = results.filter(r => r.success).length;
        const totalMessages = results.reduce((sum, r) => sum + r.messagesProcessed, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
        
        logger.info(`📈 Summary:`);
        logger.info(`   ✅ Successful: ${successfulScenarios}/${totalScenarios} scenarios`);
        logger.info(`   📤 Messages: ${totalMessages} processed`);
        logger.info(`   ❌ Errors: ${totalErrors} total`);
        
        logger.info('\n📋 Details:');
        results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            logger.info(`   ${status} ${result.scenario}:`);
            logger.info(`      Messages: ${result.messagesProcessed}`);
            logger.info(`      Duration: ${result.duration}ms`);
            
            if (result.errors.length > 0) {
                logger.info(`      Errors: ${result.errors.join(', ')}`);
            }
        });
        
        logger.info('\n🎯 Next Steps:');
        if (successfulScenarios === totalScenarios) {
            logger.info('   🚀 All tests passed! Messages sent to LocalStack SQS.');
            logger.info('   📝 Check webhook-subscriber and intent-subscriber logs.');
            logger.info('   🔍 Verify database records were created.');
        } else {
            logger.info('   🔧 Some tests failed. Check LocalStack connectivity.');
            logger.info('   📋 Ensure SQS queues exist and are accessible.');
        }
        
        logger.info('='.repeat(60));
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        const test = new WebhookPipelineTest();
        await test.initialize();
        await test.runAllTests();
        
        logger.info('🏁 Pipeline test completed');
        process.exit(0);
    } catch (error) {
        logger.error(error,'💥 Pipeline test failed:');
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

export { WebhookPipelineTest };
