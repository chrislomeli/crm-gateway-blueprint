/**
 * Singles-specific service for HubSpot contact synchronization
 * Handles one contact at a time processing (optimized for webhooks)
 */

import {AppErrorType, failure, failureFromError, logger, Result, success} from '@platform/core';
import {ContactInfo, ContactMetaData, OAuth} from '../types';
import {HubspotSyncBase} from './hubspot.sync-base';
import {IContactRepository} from '../repositories';
import {ElasticsearchFacade} from "@platform/connectors";

export class HubspotSyncSingles extends HubspotSyncBase {
  private contactRepo: IContactRepository;

  constructor(businessId: number, portalId: number, contactRepo?: IContactRepository) {
    super(businessId, portalId);
    // Use injected repository or fall back to the hubspotRepo from base class
    this.contactRepo = contactRepo || this.hubspotRepo;
  }


  async syncOneContact(businessId: number, portalId: number, contactId: number, contactMetaData: ContactMetaData,  oauth?: OAuth): Promise<Result<ContactInfo>> {
    // Simple, direct approach for single contact sync (webhook processing)
    
    const ownerMap = {}; // Empty - webhook processing doesn't need user assignments
    const properties = this.dbRepo.getDefaultHubspotProperties();

    // Get OAuth token if not provided
    if (!oauth || !oauth.token) {
      const fetchOauth = await this.tokenManager.getOAuthByBusinessAndPortal(businessId, portalId);
      if (!fetchOauth) {
        throw new Error(`No OAuth token found for business ${businessId} and portal ${portalId}`);
      }
      oauth = fetchOauth;
    }

    // Ensure we have a valid access token
    // await this.contactRepo.ensureValidToken(oauth);

    try {
      // Direct contact retrieval - much faster than search API
      const contact = await this.contactRepo.getContactById({ contactId: contactId.toString(), properties, portalId, businessId});
      
      if (!contact) {
        logger.warn({ contactId, businessId, portalId }, 'Contact not found');
        return failure({message: 'Contact not found', type: AppErrorType.NOT_FOUND});
      }

      logger.debug(contact, '++ Hubspot Contact Record ++');

      const deals = contact?.associations?.deals?.results || []

      const associatedDeals = deals.reduce((acc: string[], association: { id: string }) => {
        acc.push(association.id);
        return acc;
      }, []);


      // Get deals for this contact
      const contactDeals = await this.contactRepo.getDealsByIds({
        ids: associatedDeals,
        portalId,
        businessId
      });


      // Process single contact using base class method
      const processedContact = await this.processContact(contact, contactDeals, ownerMap, contactMetaData);
      
      // Update powerlist and OpenSearch for single contact
      await this.updatePowerlistOwnerForSingleContact(processedContact);

      // update OpenSearch - generate deterministic ID and replace document
      const documentId = ElasticsearchFacade.generateContactId(
        processedContact.businessid, 
        parseInt(processedContact.acmecrmid), 
        processedContact.externalid
      );
      
      if (!documentId) {
        logger.error({ processedContact }, 'Failed to generate document ID for contact');
        return failure({message: 'Contact id generation failed', type: AppErrorType.INTERNAL_ERROR});
      }
      
      // Use tenant-aware facade - automatically handles index creation and tenant isolation

      const indexResponse = await ElasticsearchFacade.indexContact(
        businessId.toString(),
        parseInt(processedContact.acmecrmid),
        processedContact,
        { id: documentId }
      );
      
      if (!indexResponse.success) {
        logger.error({
          error: indexResponse.error,
          contactId,
          businessId,
          portalId,
          documentId
        }, 'Failed to index single contact');
        return failure({message: 'No response from OpenSearch', type: AppErrorType.DATABASE_ERROR});
      }

      logger.info({ contactId, businessId, portalId }, 'Single contact synced successfully');
      
      return success(processedContact);
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        contactId, 
        businessId, 
        portalId 
      }, 'Failed to sync single contact');

      return failureFromError(error as Error);
    }
  }

  // All shared functionality is now inherited from HubspotSyncBase
}
