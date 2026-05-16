/**
 * Contact Repository Interface
 * 
 * Focused interface containing only the HubSpot repository methods actually used by our services.
 * This allows for easy mocking and dependency injection for testing.
 */

import { HubspotContact, HubspotDeal, OAuth } from '../types';

export interface IContactRepository {
  /**
   * Ensure we have a valid access token
   */
  ensureValidToken(portalId?: number, businessId?: number): Promise<OAuth>

  /**
   * Get a single contact by ID with properties and associations
   */
  getContactById(params: {
    contactId: string;
    properties: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotContact | null>;

  /**
   * Get deals by their IDs
   */
  getDealsByIds(params: {
    ids: string[];
    portalId?: number;
    businessId?: number;
  }): Promise<HubspotDeal[]>;
}
