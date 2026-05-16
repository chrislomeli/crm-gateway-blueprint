/**
 * Clean facade for HubSpot contact operations
 * Provides simple interface for services to use
 */

import { HubspotSyncMultiples } from '../services/hubspot.sync-multiples';
import { HubSpotRepository } from '../repositories/hubspot-repository';
import { ContactTransformer } from '../transformers/contact-transformer';
import { 
  FullSyncRequest,
  SpecificContactsSyncRequest,
  SyncResult,
  OAuth
} from '../types/hubspot-types';

export interface ContactControllerConfig {
  businessId: number;
  userId: number;
  portalId: string;
  // External dependencies injected by service layer
  dbRepo: any;
  esRepo: any;
}

export class ContactController {
  private syncService: HubspotSyncMultiples;

  constructor(config: ContactControllerConfig) {
    const hubspotRepo = new HubSpotRepository();
    const transformer = new ContactTransformer({
      businessId: config.businessId,
      portalId: config.portalId
    });

    this.syncService = new HubspotSyncMultiples({
      businessId: config.businessId,
      userId: config.userId,
      portalId: config.portalId,
      hubspotRepo,
      esRepo: config.esRepo,
      dbRepo: config.dbRepo,
      transformer
    });
  }

  /**
   * Sync all contacts from HubSpot (bulk import)
   */
  async syncAllContacts(request: FullSyncRequest): Promise<SyncResult> {
    return this.syncService.fullSync(request);
  }

  /**
   * Sync specific contacts by IDs (webhook processing)
   */
  async syncSpecificContacts(request: SpecificContactsSyncRequest): Promise<SyncResult> {
    return this.syncService.syncMultipleContacts(request);
  }

  /**
   * Simple factory method for services
   */
  static create(config: ContactControllerConfig): ContactController {
    return new ContactController(config);
  }
}
