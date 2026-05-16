/**
 * Mock Contact Repository
 * 
 * Mock implementation of IContactRepository that uses our seeded database data
 * to provide realistic test data without calling the real HubSpot API.
 */

import { logger } from '@platform/core';
import { MySQLService } from '@platform/connectors';
import { IContactRepository } from './contact-repository.interface';
import { HubspotContact, HubspotDeal, OAuth } from '../types';

export class MockContactRepository implements IContactRepository {
  private contactTemplate: HubspotContact;
  private dealTemplate: HubspotDeal;
  private name = 'MockContactRepository';

  constructor() {
    // Template contact object that we'll customize with real businessId + objectId data
    this.contactTemplate = {
      id: '', // Will be set from objectId
      properties: {
        email: 'test@example.com',
        firstname: 'Test',
        lastname: 'Contact',
        phone: '+1-555-0123',
        company: 'Test Company',
        jobtitle: 'Test Manager',
        lifecyclestage: 'customer',
        hubspot_owner_id: '12345',
        createdate: '2024-01-01T00:00:00.000Z',
        lastmodifieddate: new Date().toISOString(),
        hs_object_id: '', // Will be set from objectId
      },
      associations: {
        deals: {
          results: [] // Will be populated with associated deals
        }
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
      archived: false
    };

    // Template deal object
    this.dealTemplate = {
      id: '', // Will be set from deal ID
      properties: {
        dealname: 'Test Deal',
        pipeline: 'default',
        dealstage: 'qualifiedtobuy',
        amount: '10000',
        closedate: '2024-12-31',
        createdate: '2024-01-01T00:00:00.000Z',
        hs_lastmodifieddate: new Date().toISOString(),
        hubspot_owner_id: '12345'
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
      archived: false
    };
  }

  /**
   * Mock token validation - always succeeds
   */
  async ensureValidToken(portalId?: number, businessId?: number): Promise<OAuth> {
    logger.debug({ portalId, businessId }, 'Mock: Token validation successful');
    
    // Return a mock OAuth object
    return {
      businessid: businessId || 12345,
      businessId: businessId || 12345,
      token: 'mock-refresh-token',
      apiKey: 'mock-api-key',
      accessToken: `mock-access-token-${businessId || 12345}`,
      tokenvaliduntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now

    };
  }

  /**
   * Get contact by ID using our seeded database data
   */
  async getContactById(params: {
    contactId: string;
    properties: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotContact | null> {
    const { contactId, properties, portalId, businessId } = params;
    
    logger.debug({ contactId, portalId, businessId }, 'Mock: Getting contact by ID');
    
    const response = {
      "id": contactId, // Use the actual contactId passed in
      "properties": {
        "address": "Santa Clara, California, United States",
        "associatedcompanyid": "",
        "city": null,
        "company": "Flexton Inc.",
        "createdate": "2022-04-26T16:36:06.173Z",
        "email": "nayan@flextoninc.com",
        "firstname": "Nayan",
        "hs_object_id": contactId,
        "hubspot_owner_id": "97192876",
        "lastmodifieddate": "2025-08-27T20:19:12.007Z",
        "lastname": "Patel",
        "mobilephone": null,
        "phone": null,
        "state": null,
        "zip": null
      }
    }
    return response as unknown as HubspotContact;
  }





  /**
   * Get deals by IDs - return mock deals
   */
  async getDealsByIds(params: {
    ids: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotDeal[]> {
    const { ids, portalId, businessId } = params;

    if (ids.length === 0) {
      return [];
    }

    // Create mock deals for each ID
    const deals = ids.map((dealId, index) => ({
      ...this.dealTemplate,
      id: dealId,
      properties: {
        ...this.dealTemplate.properties,
        dealname: `Mock Deal ${index + 1}`,
        amount: String((index + 1) * 5000), // Vary the amounts
        hs_object_id: dealId
      }
    }));

    logger.debug({ 
      dealCount: deals.length,
      dealIds: ids,
      portalId,
      businessId
    }, 'Mock: Deals retrieved successfully');

    return deals;
  }
}
