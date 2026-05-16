/**
 * Base class for HubSpot contact synchronization
 * Contains shared functionality for both single and multiple contact processing
 */

import {DbRepository, HubSpotRepository} from '../repositories';
import { ContactTransformer } from '../transformers';
import { logger } from '@platform/core';

import {
  THubspotWebhookRequest,
  FullSyncRequest,
  SpecificContactsSyncRequest,
  HubspotContact,
  HubspotDeal,
  SyncResult, OAuth, ContactMetaData
} from '../types';
import {TokenManager} from "../utils";
import {OpenSearchService} from "@platform/connectors";

export abstract class HubspotSyncBase {
  protected hubspotRepo: HubSpotRepository;
  protected dbRepo: DbRepository;
  protected businessId: number;
  protected portalId: number;
  protected transformer: ContactTransformer;
  protected tokenManager: TokenManager;

  constructor(businessId: number, portalId: number) {
    this.hubspotRepo = new HubSpotRepository();
    this.dbRepo = new DbRepository();
    this.transformer = new ContactTransformer({businessId, portalId});
    this.businessId = businessId;
    this.portalId = portalId;
    this.tokenManager = new TokenManager();
  }


  /**
   * Process a single contact with deals and transformation
   */
  protected async processContact(
    contact: HubspotContact,
    deals: HubspotDeal[],
    ownerMap: Record<string, string>,
    traceMetadata?: ContactMetaData
  ): Promise<any> {
    // Transform contact (deals are already provided - no need to fetch)
    const transformed = this.transformer.transformContact({
      contact,
      deals,
      ownerMap,
      traceMetadata
    });

    // Convert phone numbers to E164 format
    return this.transformer.convertPhoneNumbers(transformed);
  }

  /**
   * Fetch deals for a single contact
   */
  protected async fetchDealsForSingleContact(
     dealIds: string[],
    accessToken: string
  ): Promise<HubspotDeal[]> {
    if (!dealIds || dealIds.length === 0) {
      return [];
    }

    const deals = await this.hubspotRepo.getDealsByIds({
      ids: dealIds
    });

    return deals;
  }




  /**
   * Update powerlist owners for multiple contacts
   */
  protected async updatePowerlistOwners(contacts: any[]): Promise<{ updated: number }> {
    let updateCount = 0;
    
    for (const contact of contacts) {
      const contactUpdates = await this.updatePowerlistOwnerForSingleContact(contact);
      updateCount += contactUpdates.updated;
    }

    return { updated: updateCount };
  }

  /**
   * Update powerlist owner for a single contact
   */
  protected async updatePowerlistOwnerForSingleContact(contact: any): Promise<{ updated: number }> {
    let updateCount = 0;
    const ownerId = contact.acmeownerid || null;
    
    for (const phone of contact.phone164 || []) {
      if (phone?.phone) {
        try {
          await this.dbRepo.updatePowerlistContactOwnerByBusinessIdPhone(
            this.businessId.toString(),
            phone.phone,
            ownerId
          );
          updateCount++;
        } catch (error) {
          // Log error but continue processing other phone numbers
          logger.error({ 
            error, 
            businessId: this.businessId, 
            phone: phone.phone,
            contactId: contact.id 
          }, 'Failed to update powerlist owner');
        }
      }
    }

    return { updated: updateCount };
  }


  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
