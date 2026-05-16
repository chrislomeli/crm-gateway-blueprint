/**
 * Multiples-specific service for HubSpot contact synchronization
 * Handles batch processing with search API and bulk optimizations
 */

import { logger } from '@platform/core';
import {
  FullSyncRequest,
  SpecificContactsSyncRequest,
  HubspotContact,
  HubspotDeal,
  SyncResult
} from '../types';
import { HubspotSyncBase } from './hubspot.sync-base';
import {OpenSearchService} from "@platform/connectors";

export class HubspotSyncMultiples extends HubspotSyncBase {
  constructor(businessId: number, portalId: number) {
    super(businessId, portalId);
  }

  /**
   * Sync specific contacts by IDs using pagination (unified with fullSync approach)
   */
  async syncMultipleContacts(request: SpecificContactsSyncRequest): Promise<SyncResult> {
    const contactIds = request.ids;
    
    if (contactIds.length === 0) {
      return { completed: true, processedCount: 0 };
    }

    // TODO: Remove ownerMap - not needed for webhook processing (just contact assignment)
    // For now, keep to avoid breaking downstream code
    const ownerMap = {}; // Empty map - webhook processing doesn't need user assignments
    const properties = this.dbRepo.getDefaultHubspotProperties(); // Simplified - no need for Promise.all

    // Get OAuth token for business and portal


    if (!request.oauth || !request.oauth.token) {
      request.oauth = await this.tokenManager.getOAuthByBusinessAndPortal(request.businessId, request.portalId) || request.oauth;
      if (!request.oauth) {
        throw new Error(`No OAuth token found for business ${request.businessId} and portal ${request.portalId}`);
      }
    }

    // Ensure we have a valid access token
    await this.hubspotRepo.ensureValidToken(request.oauth);

    // Use pagination approach with contact ID filter (same pattern as fullSync)
    let hasMore = true;
    let after = '0';
    let totalProcessed = 0;
    const BATCH_SIZE = 100;

    // Create filter for specific contact IDs
    const contactIdFilter = {
      propertyName: 'hs_object_id',
      operator: 'IN',
      values: request.ids
    };

    while (hasMore) {
      logger.info({ after, batchSize: BATCH_SIZE, contactIdsCount: request.ids.length }, 'Fetching specific contacts batch');

      // Use search API with contact ID filter and pagination
      const batch = await this.hubspotRepo.searchContacts({
        accessToken: request.oauth.accessToken || '',
        filters: [contactIdFilter],
        properties,
        limit: BATCH_SIZE,
        after
      });

      if (batch.results?.length > 0) {
        // Fetch associations for this batch (reuse existing logic)
        const batchContactIds = batch.results.map(c => c.id);
        const associations = await this.hubspotRepo.getBatchAssociations({
          accessToken: request.oauth.accessToken || '',
          fromObjectType: 'contacts',
          toObjectType: 'deals',
          ids: batchContactIds
        });

        // Add associations to contacts
        batch.results.forEach(contact => {
          const dealAssociations = associations[contact.id] || [];
          contact.associations = {
            deals: {
              results: dealAssociations.map((dealId: string) => ({
                id: dealId,
                type: 'deal'
              }))
            }
          };
        });

        // Process the batch using same logic as fullSync
        await this.processBatch(batch.results, ownerMap, request);
        totalProcessed += batch.results.length;
      }

      // Prepare for next iteration (same pagination logic as fullSync)
      hasMore = !!batch.paging?.next?.after;
      after = batch.paging?.next?.after || '';

      logger.info({ 
        batchSize: batch.results?.length || 0,
        totalProcessed, 
        hasMore, 
        nextOffset: after 
      }, 'Specific contacts batch processed');

      // Small delay to avoid rate limits (same as fullSync)
      if (hasMore) {
        await this.sleep(1000);
      }
    }

    return { 
      completed: true, 
      processedCount: totalProcessed 
    };
  }

  /**
   * Process a batch of contacts using batch optimization
   */
  private async processBatch(
    contacts: HubspotContact[], 
    ownerMap: Record<string, string>, 
    request: FullSyncRequest | SpecificContactsSyncRequest
  ): Promise<void> {
    if (!contacts?.length) return;

    // Get deals for all contacts in batch (optimization for multiples)
    const dealsMap = await this.fetchDealsForMultipleContacts(
      contacts, 
      request.oauth.accessToken || ''
    );

    // Transform contacts
    const transformed = contacts.map(contact => {
      const deals = dealsMap[contact.id] || [];
      return this.transformer.transformContact({
        contact,
        deals,
        ownerMap
      });
    });

    // Convert phone numbers to E164 format
    const converted = transformed.map(contact => 
      this.transformer.convertPhoneNumbers(contact)
    );

    // Bulk operations using base class methods
    const powerlistResult = await this.updatePowerlistOwners(converted);
    const bulkResponse = await OpenSearchService.bulk(converted);
    if (!bulkResponse.success) {
      logger.error({
        error: bulkResponse.error,
        contactsProcessed: converted.length,
        powerlistUpdated: powerlistResult.updated
      }, 'Batch processing failed');
      return;
    }

    logger.info({
      contactsProcessed: converted.length,
      powerlistUpdated: powerlistResult.updated
    }, 'Batch processing complete');
  }

  /**
   * Fetch deals for multiple contacts (batch optimization)
   * This is the multiples-specific optimization that was removed from base class
   */
  private async fetchDealsForMultipleContacts(
    contacts: HubspotContact[], 
    accessToken: string
  ): Promise<Record<string, HubspotDeal[]>> {
    const dealsMap: Record<string, HubspotDeal[]> = {};

    // Extract deal IDs from contact associations
    const dealIdsByContact: Record<string, string[]> = {};
    contacts.forEach(contact => {
      if (contact.associations?.deals?.results) {
        dealIdsByContact[contact.id] = contact.associations.deals.results.map(d => d.id);
      }
    });

    // Fetch all unique deal IDs in one batch call (optimization!)
    const allDealIds = [...new Set(Object.values(dealIdsByContact).flat())];
    
    if (allDealIds.length > 0) {
      const deals = await this.hubspotRepo.getDealsByIds({
        accessToken,
        ids: allDealIds
      });

      // Map deals back to contacts
      Object.entries(dealIdsByContact).forEach(([contactId, dealIds]) => {
        dealsMap[contactId] = deals.filter(deal => dealIds.includes(deal.id));
      });
    }

    return dealsMap;
  }


  // All other shared functionality is inherited from HubspotSyncBase
}
