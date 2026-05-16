/**
 * Raw HubSpot Webhook Payloads Generator
 * 
 * Creates comprehensive raw webhook payloads that match actual HubSpot webhook formats.
 * These are the raw HTTP POST payloads that HubSpot sends to webhook endpoints,
 * NOT the processed internal HubspotUpdateEvent objects.
 * 
 * Use these for testing the webhook publisher input processing.
 */

import { logger } from '@platform/core';

/**
 * Raw HubSpot webhook payload structure (what HubSpot actually sends)
 */
export interface RawHubSpotWebhookPayload {
  eventId: string;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  changeSource: string;
  changeFlag?: string;
  propertyName?: string;
  propertyValue?: any;
  newValue?: any;
  previousValue?: any;
}

/**
 * Batch webhook payload (array of events)
 */
export interface RawHubSpotBatchWebhookPayload extends Array<RawHubSpotWebhookPayload> {}

/**
 * Generator for comprehensive raw HubSpot webhook payloads
 */
export class RawWebhookPayloadGenerator {
  private portalId: number;
  private appId: number;
  private subscriptionId: number;

  constructor(portalId: number = 12345, appId: number = 67890, subscriptionId: number = 123) {
    this.portalId = portalId;
    this.appId = appId;
    this.subscriptionId = subscriptionId;
  }

  /**
   * Generate a base webhook event with common fields
   */
  private generateBaseEvent(objectId: number, subscriptionType: string): RawHubSpotWebhookPayload {
    return {
      eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId: this.subscriptionId,
      portalId: this.portalId,
      appId: this.appId,
      occurredAt: Date.now(),
      subscriptionType,
      attemptNumber: 0,
      objectId,
      changeSource: 'CRM_UI'
    };
  }

  /**
   * Contact Creation Events
   */
  generateContactCreation(objectId: number = 98765): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'contact.creation'),
      changeFlag: 'NEW'
    };
  }

  /**
   * Contact Property Change Events
   */
  generateContactPropertyChange(
    objectId: number = 98765,
    propertyName: string = 'email',
    newValue: any = 'test@example.com',
    previousValue: any = 'old@example.com'
  ): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'contact.propertyChange'),
      propertyName,
      propertyValue: newValue,
      newValue,
      previousValue
    };
  }

  /**
   * Contact Deletion Events
   */
  generateContactDeletion(objectId: number = 98765): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'contact.deletion'),
      changeFlag: 'DELETED'
    };
  }

  /**
   * Deal Creation Events
   */
  generateDealCreation(objectId: number = 54321): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'deal.creation'),
      changeFlag: 'NEW'
    };
  }

  /**
   * Deal Property Change Events
   */
  generateDealPropertyChange(
    objectId: number = 54321,
    propertyName: string = 'dealstage',
    newValue: any = 'closedwon',
    previousValue: any = 'qualifiedtobuy'
  ): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'deal.propertyChange'),
      propertyName,
      propertyValue: newValue,
      newValue,
      previousValue
    };
  }

  /**
   * Company Events
   */
  generateCompanyCreation(objectId: number = 11111): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'company.creation'),
      changeFlag: 'NEW'
    };
  }

  generateCompanyPropertyChange(
    objectId: number = 11111,
    propertyName: string = 'name',
    newValue: any = 'New Company Name',
    previousValue: any = 'Old Company Name'
  ): RawHubSpotWebhookPayload {
    return {
      ...this.generateBaseEvent(objectId, 'company.propertyChange'),
      propertyName,
      propertyValue: newValue,
      newValue,
      previousValue
    };
  }

  /**
   * Generate realistic contact property changes for common fields
   */
  generateRealisticContactEvents(objectId: number = 98765): RawHubSpotWebhookPayload[] {
    return [
      // Email change
      this.generateContactPropertyChange(objectId, 'email', 'john.doe@newcompany.com', 'john.doe@oldcompany.com'),
      
      // Phone change
      this.generateContactPropertyChange(objectId, 'phone', '+1-555-0199', '+1-555-0123'),
      
      // Lifecycle stage change
      this.generateContactPropertyChange(objectId, 'lifecyclestage', 'customer', 'lead'),
      
      // Lead status change
      this.generateContactPropertyChange(objectId, 'hs_lead_status', 'CONNECTED', 'NEW'),
      
      // Owner assignment
      this.generateContactPropertyChange(objectId, 'hubspot_owner_id', '12345', null),
      
      // Job title change
      this.generateContactPropertyChange(objectId, 'jobtitle', 'Senior Manager', 'Manager'),
      
      // Company change
      this.generateContactPropertyChange(objectId, 'company', 'New Corp', 'Old Corp'),
      
      // Custom intent field (example)
      this.generateContactPropertyChange(objectId, 'intent_score', '85', '72'),
    ];
  }

  /**
   * Generate realistic deal property changes
   */
  generateRealisticDealEvents(objectId: number = 54321): RawHubSpotWebhookPayload[] {
    return [
      // Deal stage progression
      this.generateDealPropertyChange(objectId, 'dealstage', 'presentationscheduled', 'qualifiedtobuy'),
      
      // Amount change
      this.generateDealPropertyChange(objectId, 'amount', '15000', '10000'),
      
      // Close date change
      this.generateDealPropertyChange(objectId, 'closedate', '2024-12-31', '2024-11-30'),
      
      // Deal name change
      this.generateDealPropertyChange(objectId, 'dealname', 'Updated Deal Name', 'Original Deal Name'),
      
      // Owner assignment
      this.generateDealPropertyChange(objectId, 'hubspot_owner_id', '12345', '67890'),
    ];
  }

  /**
   * Generate batch webhook payload with mixed event types
   */
  generateMixedBatchPayload(): RawHubSpotBatchWebhookPayload {
    const contactId = 98765;
    const dealId = 54321;
    const companyId = 11111;

    return [
      // Contact events
      this.generateContactCreation(contactId),
      ...this.generateRealisticContactEvents(contactId),
      
      // Deal events
      this.generateDealCreation(dealId),
      ...this.generateRealisticDealEvents(dealId),
      
      // Company events
      this.generateCompanyCreation(companyId),
      this.generateCompanyPropertyChange(companyId, 'name', 'Acme Corp', 'Old Corp'),
      
      // Some deletions
      this.generateContactDeletion(99999),
    ];
  }

  /**
   * Generate contact-only batch payload (most common scenario)
   */
  generateContactOnlyBatchPayload(contactId: number = 98765): RawHubSpotBatchWebhookPayload {
    return [
      this.generateContactCreation(contactId),
      ...this.generateRealisticContactEvents(contactId),
    ];
  }

  /**
   * Generate high-volume batch payload for load testing
   */
  generateHighVolumeBatchPayload(eventCount: number = 100): RawHubSpotBatchWebhookPayload {
    const events: RawHubSpotBatchWebhookPayload = [];
    
    for (let i = 0; i < eventCount; i++) {
      const contactId = 100000 + i;
      const eventType = i % 4;
      
      switch (eventType) {
        case 0:
          events.push(this.generateContactCreation(contactId));
          break;
        case 1:
          events.push(this.generateContactPropertyChange(contactId, 'email', `contact${i}@example.com`, `old${i}@example.com`));
          break;
        case 2:
          events.push(this.generateContactPropertyChange(contactId, 'lifecyclestage', 'customer', 'lead'));
          break;
        case 3:
          events.push(this.generateContactPropertyChange(contactId, 'hubspot_owner_id', '12345', null));
          break;
      }
    }
    
    return events;
  }

  /**
   * Generate webhook payloads that match our seeded database data
   */
  generateSeededDataWebhookPayload(): RawHubSpotBatchWebhookPayload {
    // Use objectIds that match our seeded businessDetails data
    const seededObjectIds = [1001, 1002, 1003, 1004, 1005];
    const events: RawHubSpotBatchWebhookPayload = [];

    seededObjectIds.forEach((objectId, index) => {
      // Contact creation
      events.push(this.generateContactCreation(objectId));
      
      // Property changes that will find matches in our mock repository
      events.push(
        this.generateContactPropertyChange(objectId, 'email', `updated${index}@example.com`, `original${index}@example.com`),
        this.generateContactPropertyChange(objectId, 'lifecyclestage', 'customer', 'lead'),
        this.generateContactPropertyChange(objectId, 'hubspot_owner_id', '12345', null)
      );
    });

    return events;
  }
}

/**
 * Pre-built webhook payload scenarios for testing
 */
export class WebhookTestScenarios {
  private generator: RawWebhookPayloadGenerator;

  constructor(portalId: number = 12345) {
    this.generator = new RawWebhookPayloadGenerator(portalId);
  }

  /**
   * Scenario: New lead comes in and gets qualified
   */
  getNewLeadScenario(): RawHubSpotBatchWebhookPayload {
    const contactId = 98765;
    return [
      this.generator.generateContactCreation(contactId),
      this.generator.generateContactPropertyChange(contactId, 'email', 'newlead@company.com', null),
      this.generator.generateContactPropertyChange(contactId, 'lifecyclestage', 'lead', 'subscriber'),
      this.generator.generateContactPropertyChange(contactId, 'hs_lead_status', 'CONNECTED', 'NEW'),
      this.generator.generateContactPropertyChange(contactId, 'hubspot_owner_id', '12345', null),
    ];
  }

  /**
   * Scenario: Existing contact becomes a customer
   */
  getCustomerConversionScenario(): RawHubSpotBatchWebhookPayload {
    const contactId = 98765;
    const dealId = 54321;
    return [
      this.generator.generateContactPropertyChange(contactId, 'lifecyclestage', 'customer', 'opportunity'),
      this.generator.generateDealPropertyChange(dealId, 'dealstage', 'closedwon', 'presentationscheduled'),
      this.generator.generateDealPropertyChange(dealId, 'amount', '25000', '20000'),
    ];
  }

  /**
   * Scenario: Contact gets reassigned to new owner
   */
  getOwnerReassignmentScenario(): RawHubSpotBatchWebhookPayload {
    const contactId = 98765;
    return [
      this.generator.generateContactPropertyChange(contactId, 'hubspot_owner_id', '67890', '12345'),
      this.generator.generateContactPropertyChange(contactId, 'hs_lead_status', 'ATTEMPTING_TO_CONTACT', 'CONNECTED'),
    ];
  }

  /**
   * Scenario: Batch import simulation
   */
  getBatchImportScenario(): RawHubSpotBatchWebhookPayload {
    return this.generator.generateHighVolumeBatchPayload(50);
  }

  /**
   * Scenario: Using seeded database data
   */
  getSeededDataScenario(): RawHubSpotBatchWebhookPayload {
    return this.generator.generateSeededDataWebhookPayload();
  }
}

/**
 * Utility functions for webhook testing
 */
export class WebhookTestUtils {
  /**
   * Log webhook payload in a readable format
   */
  static logWebhookPayload(payload: RawHubSpotBatchWebhookPayload, scenarioName: string): void {
    logger.info({
      scenario: scenarioName,
      eventCount: payload.length,
      portalId: payload[0]?.portalId,
      subscriptionTypes: [...new Set(payload.map(e => e.subscriptionType))],
      objectIds: [...new Set(payload.map(e => e.objectId))],
    }, 'Generated webhook payload');

    payload.forEach((event, index) => {
      logger.debug({
        index,
        eventId: event.eventId,
        subscriptionType: event.subscriptionType,
        objectId: event.objectId,
        propertyName: event.propertyName,
        propertyValue: event.propertyValue,
        changeSource: event.changeSource
      }, `Event ${index + 1}`);
    });
  }

  /**
   * Convert raw webhook payload to JSON string (ready for HTTP POST)
   */
  static toJsonPayload(payload: RawHubSpotBatchWebhookPayload): string {
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Validate webhook payload structure
   */
  static validateWebhookPayload(payload: RawHubSpotBatchWebhookPayload): boolean {
    if (!Array.isArray(payload) || payload.length === 0) {
      logger.error('Webhook payload must be a non-empty array');
      return false;
    }

    for (const event of payload) {
      const required = ['eventId', 'subscriptionId', 'portalId', 'appId', 'occurredAt', 'subscriptionType', 'objectId'];
      for (const field of required) {
        if (!(field in event)) {
          logger.error({ field, event }, 'Missing required field in webhook event');
          return false;
        }
      }
    }

    return true;
  }
}
