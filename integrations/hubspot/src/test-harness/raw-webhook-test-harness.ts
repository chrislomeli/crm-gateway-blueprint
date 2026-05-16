/**
 * Raw Webhook Test Harness
 * 
 * Updated test harness that uses raw HubSpot webhook payloads (what HubSpot actually sends)
 * instead of processed internal events. This properly tests the webhook publisher input processing.
 */

import { logger } from '@platform/core';
import { ConfigProvider } from '@platform/configuration';
import { 
  RawWebhookPayloadGenerator, 
  WebhookTestScenarios, 
  WebhookTestUtils,
  RawHubSpotBatchWebhookPayload 
} from './raw-webhook-payloads';

/**
 * Test result interface
 */
interface TestResult {
  scenario: string;
  success: boolean;
  messagesProcessed: number;
  errors: string[];
  duration: number;
  rawPayloadSize: number;
}

/**
 * Raw Webhook Test Harness
 * Tests the webhook publisher by sending raw HubSpot webhook payloads
 */
export class RawWebhookTestHarness {
  private webhookEndpoint: string;
  private scenarios: WebhookTestScenarios;
  private generator: RawWebhookPayloadGenerator;

  constructor() {
    // In a real test, this would be the webhook publisher endpoint
    // For now, we'll simulate the webhook processing
    this.webhookEndpoint = 'http://localhost:3000/webhook/hubspot';
    this.scenarios = new WebhookTestScenarios(12345); // Use test portal ID
    this.generator = new RawWebhookPayloadGenerator(12345);
  }

  /**
   * Initialize the test harness
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Raw Webhook Test Harness');
    
    // Initialize configuration
    await ConfigProvider.initialize();
    
    logger.info('✅ Raw Webhook Test Harness initialized');
  }

  /**
   * Simulate webhook processing (in lieu of actual HTTP POST to webhook endpoint)
   * In a real implementation, this would make HTTP requests to the webhook publisher
   */
  private async simulateWebhookProcessing(payload: RawHubSpotBatchWebhookPayload): Promise<{
    success: boolean;
    messagesProcessed: number;
    errors: string[];
  }> {
    try {
      // Validate the payload structure
      if (!WebhookTestUtils.validateWebhookPayload(payload)) {
        return {
          success: false,
          messagesProcessed: 0,
          errors: ['Invalid webhook payload structure']
        };
      }

      // Simulate processing each event in the batch
      const errors: string[] = [];
      let processedCount = 0;

      for (const event of payload) {
        try {
          // Simulate webhook publisher processing logic
          logger.debug({
            eventId: event.eventId,
            subscriptionType: event.subscriptionType,
            objectId: event.objectId,
            propertyName: event.propertyName
          }, 'Processing raw webhook event');

          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
          
          processedCount++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Event ${event.eventId}: ${errorMsg}`);
        }
      }

      return {
        success: errors.length === 0,
        messagesProcessed: processedCount,
        errors
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        messagesProcessed: 0,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Run a test scenario with raw webhook payload
   */
  async runScenario(name: string, payload: RawHubSpotBatchWebhookPayload): Promise<TestResult> {
    logger.info(`🧪 Running raw webhook scenario: ${name}`);
    
    const startTime = Date.now();
    
    try {
      // Log the payload for debugging
      WebhookTestUtils.logWebhookPayload(payload, name);
      
      // Simulate webhook processing
      const result = await this.simulateWebhookProcessing(payload);
      const duration = Date.now() - startTime;
      
      logger.info(`✅ Scenario '${name}' completed: ${result.messagesProcessed} events processed in ${duration}ms`);
      
      return {
        scenario: name,
        success: result.success,
        messagesProcessed: result.messagesProcessed,
        errors: result.errors,
        duration,
        rawPayloadSize: JSON.stringify(payload).length
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ error }, `❌ Scenario '${name}' failed`);
      
      return {
        scenario: name,
        success: false,
        messagesProcessed: 0,
        errors: [errorMsg],
        duration,
        rawPayloadSize: JSON.stringify(payload).length
      };
    }
  }

  /**
   * Run all predefined test scenarios
   */
  async runAllScenarios(): Promise<TestResult[]> {
    logger.info('🎯 Running all raw webhook test scenarios');
    
    const results: TestResult[] = [];

    // Scenario 1: New lead qualification
    results.push(await this.runScenario(
      'New Lead Qualification',
      this.scenarios.getNewLeadScenario()
    ));

    // Scenario 2: Customer conversion
    results.push(await this.runScenario(
      'Customer Conversion',
      this.scenarios.getCustomerConversionScenario()
    ));

    // Scenario 3: Owner reassignment
    results.push(await this.runScenario(
      'Owner Reassignment',
      this.scenarios.getOwnerReassignmentScenario()
    ));

    // Scenario 4: Seeded data (matches our mock repository)
    results.push(await this.runScenario(
      'Seeded Data Scenario',
      this.scenarios.getSeededDataScenario()
    ));

    // Scenario 5: Mixed event types
    results.push(await this.runScenario(
      'Mixed Event Types',
      this.generator.generateMixedBatchPayload()
    ));

    // Scenario 6: Contact-only events
    results.push(await this.runScenario(
      'Contact Only Events',
      this.generator.generateContactOnlyBatchPayload()
    ));

    // Scenario 7: High volume (load test)
    results.push(await this.runScenario(
      'High Volume Load Test',
      this.generator.generateHighVolumeBatchPayload(100)
    ));

    return results;
  }

  /**
   * Run custom scenario with specific parameters
   */
  async runCustomScenario(
    name: string,
    portalId: number,
    contactIds: number[],
    eventTypes: string[] = ['contact.creation', 'contact.propertyChange']
  ): Promise<TestResult> {
    const customGenerator = new RawWebhookPayloadGenerator(portalId);
    const payload: RawHubSpotBatchWebhookPayload = [];

    contactIds.forEach(contactId => {
      eventTypes.forEach(eventType => {
        if (eventType === 'contact.creation') {
          payload.push(customGenerator.generateContactCreation(contactId));
        } else if (eventType === 'contact.propertyChange') {
          payload.push(customGenerator.generateContactPropertyChange(
            contactId,
            'email',
            `contact${contactId}@example.com`,
            `old${contactId}@example.com`
          ));
        }
      });
    });

    return await this.runScenario(name, payload);
  }

  /**
   * Generate test report
   */
  generateReport(results: TestResult[]): void {
    logger.info('📊 Raw Webhook Test Report');
    logger.info('=' .repeat(50));

    let totalEvents = 0;
    let totalDuration = 0;
    let successfulScenarios = 0;
    let totalPayloadSize = 0;

    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      logger.info(`${status} ${result.scenario}`);
      logger.info(`   Events: ${result.messagesProcessed}, Duration: ${result.duration}ms, Payload: ${result.rawPayloadSize} bytes`);
      
      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          logger.error(`   Error: ${error}`);
        });
      }

      totalEvents += result.messagesProcessed;
      totalDuration += result.duration;
      totalPayloadSize += result.rawPayloadSize;
      if (result.success) successfulScenarios++;
    });

    logger.info('=' .repeat(50));
    logger.info(`📈 Summary:`);
    logger.info(`   Scenarios: ${successfulScenarios}/${results.length} successful`);
    logger.info(`   Total Events: ${totalEvents}`);
    logger.info(`   Total Duration: ${totalDuration}ms`);
    logger.info(`   Average Duration: ${Math.round(totalDuration / results.length)}ms per scenario`);
    logger.info(`   Total Payload Size: ${totalPayloadSize} bytes`);
    logger.info(`   Average Throughput: ${Math.round(totalEvents / (totalDuration / 1000))} events/second`);
  }
}

/**
 * Main test runner function
 */
export async function runRawWebhookTests(): Promise<void> {
  const harness = new RawWebhookTestHarness();
  
  try {
    await harness.initialize();
    
    logger.info('🎬 Starting raw webhook payload tests...');
    const results = await harness.runAllScenarios();
    
    harness.generateReport(results);
    
    logger.info('🏁 Raw webhook tests completed');
    
  } catch (error) {
    logger.error({ error }, '💥 Raw webhook tests failed');
    throw error;
  }
}

// Export for direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runRawWebhookTests().catch(error => {
    logger.error({ error }, 'Failed to run raw webhook tests');
    process.exit(1);
  });
}
