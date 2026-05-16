# Directory Package: hubspot-sync-refactored
# Total files: 10
################################################################################

### FILE: src/index.ts
```
/**
 * Main entry point for HubSpot sync service
 * Runs as a containerized service in Kubernetes
 */

import express from 'express';
import { HubSpotSyncController } from './controllers/hubspot-sync-controller';
import { Logger } from './utils/logger';

const app = express();
const port = process.env.PORT || 3000;
const logger = new Logger({ service: 'hubspot-sync' });

app.use(express.json());

// Health check for K8s
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Readiness check for K8s
app.get('/ready', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// Sync endpoints
const syncController = new HubSpotSyncController();
app.post('/sync/full', (req, res) => syncController.fullSync(req, res));
app.post('/sync/contacts', (req, res) => syncController.syncContacts(req, res));
app.post('/sync/webhook', (req, res) => syncController.handleWebhook(req, res));

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

app.listen(port, () => {
  logger.info(`HubSpot sync service running on port ${port}`);
});
```

### FILE: src/controllers/hubspot-sync-controller.ts
```
/**
 * HTTP controller for HubSpot sync operations
 * Handles incoming requests and orchestrates sync processes
 */

import { Request, Response } from 'express';
import { HubSpotSyncService } from '../services/hubspot-sync-service';
import { Logger } from '../utils/logger';
import * as dbPool from '../utils/db-pool';
import { THubspotWebhookRequest } from '../types/hubspot-types';

export class HubSpotSyncController {
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ component: 'HubSpotSyncController' });
  }

  /**
   * Handle full contact sync request
   */
  async fullSync(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] || Date.now().toString();
    this.logger.info('Full sync requested', { requestId, body: req.body });

    try {
      const { businessId, userId, oauth, portalId } = req.body;

      // Initialize sync tracking
      const contactSyncId = await this.initializeContactSync({
        userId,
        businessId,
        portalId
      });

      // Start async sync process
      this.runFullSync({
        contactSyncId,
        businessId,
        userId,
        oauth,
        portalId,
        requestId
      });

      res.json({
        success: true,
        contactSyncId,
        message: 'Full sync initiated'
      });

    } catch (error) {
      this.logger.error('Failed to initiate full sync', { error, requestId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle specific contacts sync request
   */
  async syncContacts(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] || Date.now().toString();
    this.logger.info('Specific contacts sync requested', { requestId, body: req.body });

    try {
      const { businessId, userId, oauth, portalId, contactIds } = req.body;

      if (!contactIds?.length) {
        return res.status(400).json({
          success: false,
          error: 'No contact IDs provided'
        });
      }

      const syncService = new HubSpotSyncService({
        logger: this.logger,
        businessId,
        userId,
        portalId
      });

      const result = await syncService.syncSpecificContacts({
        contactIds,
        oauth,
        businessId,
        userId,
        portalId
      });

      res.json({
        success: true,
        processed: result.processedCount
      });

    } catch (error) {
      this.logger.error('Failed to sync contacts', { error, requestId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle HubSpot webhook events
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] || Date.now().toString();
    this.logger.info('Webhook received', { requestId, body: req.body });

    try {
      // Process webhook event
      // Implementation depends on your webhook structure
      
      res.json({ success: true });
    } catch (error) {
      this.logger.error('Webhook processing failed', { error, requestId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Run full sync asynchronously
   */
  private async runFullSync(params: any): Promise<void> {
    const { contactSyncId, businessId, userId, oauth, portalId, requestId } = params;

    try {
      const syncService = new HubSpotSyncService({
        logger: this.logger,
        businessId,
        userId,
        portalId
      });

      const result = await syncService.fullSync({
        contactSyncId,
        oauth,
        businessId,
        userId,
        portalId,
        processedCounter: 0,
        offset: '0'
      });

      await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
        contactSyncId,
        'completed',
        null,
        JSON.stringify({ processed: result.processedCount })
      ]);

      this.logger.info('Full sync completed', { contactSyncId, result, requestId });

    } catch (error) {
      this.logger.error('Full sync failed', { error, contactSyncId, requestId });
      
      await dbPool.query('call updateCRMContactSync(?,?,?,?)', [
        contactSyncId,
        'failed',
        'syncError',
        JSON.stringify({ error: error.message })
      ]);
    }
  }

  private async initializeContactSync(params: any): Promise<string> {
    const result = await dbPool.query('call initiateCRMContactSync(?,?,?,?,?)', [
      params.userId,
      params.businessId,
      params.userId,
      16, // HubSpot CRM ID
      false
    ]);
    return result.data?.[0]?.contactSyncId;
  }
}
```

### FILE: src/services/hubspot-sync-service.ts
```
/**
 * Core service for HubSpot contact synchronization
 * Coordinates between repositories and handles business logic
 */

import { HubSpotRepository } from '../repositories/hubspot-repository';
import { ElasticsearchRepository } from '../repositories/es-repository';
import { ContactTransformer } from '../transformers/contact-transformer';
import { Logger } from '../utils/logger';
import * as dbPool from '../utils/db-pool';
import { 
  THubspotWebhookRequest, 
  HubspotContact, 
  HubspotDeal,
  SyncResult 
} from '../types/hubspot-types';

export class HubSpotSyncService {
  private logger: Logger;
  private hubspotRepo: HubSpotRepository;
  private esRepo: ElasticsearchRepository;
  private transformer: ContactTransformer;
  private businessId: number;
  private userId: number;
  private portalId: string;

  constructor({ logger, businessId, userId, portalId }) {
    this.logger = logger || new Logger({ component: 'HubSpotSyncService' });
    this.businessId = businessId;
    this.userId = userId;
    this.portalId = portalId;
    
    this.hubspotRepo = new HubSpotRepository({ logger: this.logger });
    this.esRepo = new ElasticsearchRepository({ logger: this.logger });
    this.transformer = new ContactTransformer({ businessId, portalId });
  }

  /**
   * Perform full contact synchronization
   */
  async fullSync(event: THubspotWebhookRequest): Promise<SyncResult> {
    let hasMore = true;
    let after = event.offset || '0';
    let totalProcessed = event.processedCounter || 0;
    const BATCH_SIZE = 100;

    // Ensure we have a valid access token
    await this.hubspotRepo.ensureValidToken(event.oauth);

    // Get owner mappings and properties once
    const [ownerMap, properties] = await Promise.all([
      this.getOwnerMappings(),
      this.getHubspotProperties()
    ]);

    while (hasMore) {
      // Check if sync was aborted
      if (await this.isSyncAborted(event.contactSyncId)) {
        this.logger.info('Sync aborted by user');
        return { completed: false, processedCount: totalProcessed };
      }

      this.logger.info('Fetching contact batch', { after, batchSize: BATCH_SIZE });

      // Fetch batch of contacts with associations
      const batch = await this.hubspotRepo.getContactsPage({
        accessToken: event.oauth.accessToken,
        after,
        limit: BATCH_SIZE,
        properties,
        associations: ['deals']
      });

      if (batch.results?.length > 0) {
        // Process the batch
        await this.processBatch(batch.results, ownerMap, event);
        totalProcessed += batch.results.length;

        // Update progress
        if (event.contactSyncId) {
          await this.updateSyncProgress(event.contactSyncId, batch.results.length);
        }
      }

      // Prepare for next iteration
      hasMore = !!batch.paging?.next?.after;
      after = batch.paging?.next?.after;

      this.logger.info('Batch processed', { 
        batchSize: batch.results?.length || 0,
        totalProcessed, 
        hasMore, 
        nextOffset: after 
      });

      // Small delay to avoid rate limits
      await this.sleep(1000);
    }

    return { completed: true, processedCount: totalProcessed };
  }

  /**
   * Sync specific contacts by IDs
   */
  async syncSpecificContacts(event: THubspotWebhookRequest): Promise<SyncResult> {
    const contactIds = event.ids || [];
    
    if (contactIds.length === 0) {
      return { completed: true, processedCount: 0 };
    }

    // Ensure we have a valid access token
    await this.hubspotRepo.ensureValidToken(event.oauth);

    const [ownerMap, properties] = await Promise.all([
      this.getOwnerMappings(),
      this.getHubspotProperties()
    ]);

    // Remove 'con_' prefix if present
    const cleanIds = contactIds.map(id => id.replace(/^con_/, ''));

    // Fetch specific contacts
    const contacts = await this.hubspotRepo.getContactsByIds({
      accessToken: event.oauth.accessToken,
      ids: cleanIds,
      properties
    });

    // Fetch associations for these contacts
    const associations = await this.hubspotRepo.getBatchAssociations({
      accessToken: event.oauth.accessToken,
      fromObjectType: 'contacts',
      toObjectType: 'deals',
      ids: cleanIds
    });

    // Add associations to contacts
    contacts.forEach(contact => {
      contact.associations = associations[contact.id] || [];
    });

    // Process contacts
    await this.processBatch(contacts, ownerMap, event);

    return { 
      completed: true, 
      processedCount: contacts.length 
    };
  }

  /**
   * Process a batch of contacts
   */
  private async processBatch(
    contacts: HubspotContact[], 
    ownerMap: Record<string, string>, 
    event: THubspotWebhookRequest
  ): Promise<void> {
    if (!contacts?.length) return;

    // Get deals for all contacts in batch
    const contactIds = contacts.map(c => c.id);
    const dealsMap = await this.fetchDealsForContacts(
      contactIds, 
      contacts, 
      event.oauth.accessToken
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

    // Update powerlist owners in parallel with ES indexing
    const [powerlistResult, esResult] = await Promise.all([
      this.updatePowerlistOwners(converted),
      this.esRepo.bulkIndexContacts(converted)
    ]);

    this.logger.info('Batch processing complete', {
      contactsProcessed: converted.length,
      esIndexed: esResult.indexed,
      powerlistUpdated: powerlistResult.updated
    });
  }

  /**
   * Fetch deals for a list of contacts
   */
  private async fetchDealsForContacts(
    contactIds: string[], 
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

    // Fetch all unique deal IDs
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

  /**
   * Get HubSpot properties configuration for the business
   */
  private async getHubspotProperties(): Promise<string[]> {
    const result = await dbPool.query(
      'call getHubspotPropertiesForBusiness(?)',
      [this.businessId]
    );
    return result.data?.map(p => p.name) || [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'company', 'hubspot_owner_id', 'address', 'city', 'state', 'zip'
    ];
  }

  /**
   * Get mapping of external owner IDs to acme user IDs
   */
  private async getOwnerMappings(): Promise<Record<string, string>> {
    const result = await dbPool.query(
      'call getExternalOwnersByBusinessId(?,?)',
      [this.businessId, '16'] // 16 is HubSpot CRM ID
    );
    
    const map: Record<string, string> = {};
    result.data?.forEach(record => {
      map[record.externalOwnerid] = record.userid;
    });
    return map;
  }

  /**
   * Update powerlist contact owners
   */
  private async updatePowerlistOwners(contacts: any[]): Promise<{ updated: number }> {
    const updates: Array<[string, string, string | null]> = [];
    
    for (const contact of contacts) {
      const ownerId = contact.acmeownerid || null;
      for (const phone of contact.phone164 || []) {
        if (phone?.phone) {
          updates.push([this.businessId.toString(), phone.phone, ownerId]);
        }
      }
    }

    if (updates.length > 0) {
      await dbPool.query(
        'call batchUpdatePowerlistOwners(?)',
        [JSON.stringify(updates)]
      );
    }

    return { updated: updates.length };
  }

  /**
   * Check if sync has been aborted
   */
  private async isSyncAborted(contactSyncId: string): Promise<boolean> {
    if (!contactSyncId) return false;
    
    const result = await dbPool.query('call getCRMContactSync(?)', [contactSyncId]);
    return result.data?.[0]?.status === 'aborted';
  }

  /**
   * Update sync progress in database
   */
  private async updateSyncProgress(contactSyncId: string, count: number): Promise<void> {
    await dbPool.query('call updateContactSyncProgress(?,?,?)', [
      contactSyncId,
      count,
      0
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### FILE: src/repositories/hubspot-repository.ts
```
/**
 * Repository for all HubSpot API operations
 * Encapsulates HubSpot SDK calls with retry logic
 */

import { Client } from '@hubspot/api-client';
import { Logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { TokenManager } from '../utils/token-manager';
import {
  HubspotContact,
  HubspotDeal,
  HubspotPageResponse,
  OAuth
} from '../types/hubspot-types';

export class HubSpotRepository {
  private logger: Logger;
  private tokenManager: TokenManager;
  private client: Client | null = null;

  constructor({ logger }) {
    this.logger = logger;
    this.tokenManager = new TokenManager({ logger });
  }

  /**
   * Ensure we have a valid access token
   */
  async ensureValidToken(oauth: OAuth): Promise<void> {
    const validToken = await this.tokenManager.ensureValidToken(oauth);
    this.client = new Client({ accessToken: validToken });
  }

  /**
   * Get a page of contacts with optional associations
   */
  async getContactsPage(params: {
    accessToken: string;
    after?: string;
    limit?: number;
    properties?: string[];
    associations?: string[];
  }): Promise<HubspotPageResponse<HubspotContact>> {
    const { after = '0', limit = 100, properties = [], associations = [] } = params;

    return withRetry(
      async () => {
        if (!this.client) {
          this.client = new Client({ accessToken: params.accessToken });
        }

        return await this.client.crm.contacts.basicApi.getPage(
          limit,
          after,
          properties,
          undefined, // propertiesWithHistory
          associations,
          false // archived
        );
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying HubSpot contacts page', { 
            error: error.message, 
            attempt,
            after 
          });
        }
      }
    );
  }

  /**
   * Get specific contacts by IDs
   */
  async getContactsByIds(params: {
    accessToken: string;
    ids: string[];
    properties?: string[];
  }): Promise<HubspotContact[]> {
    const { ids, properties = [] } = params;
    
    if (ids.length === 0) {
      return [];
    }

    return withRetry(
      async () => {
        if (!this.client) {
          this.client = new Client({ accessToken: params.accessToken });
        }

        const batchReadInput = {
          propertiesWithHistory: [],
          idProperty: 'hs_object_id',
          inputs: ids.map(id => ({ id })),
          properties
        };

        const response = await this.client.crm.contacts.batchApi.read(
          batchReadInput,
          false // archived
        );

        return response.results;
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying HubSpot batch read', { 
            error: error.message, 
            attempt,
            idsCount: ids.length 
          });
        }
      }
    );
  }

  /**
   * Get associations between objects
   */
  async getBatchAssociations(params: {
    accessToken: string;
    fromObjectType: string;
    toObjectType: string;
    ids: string[];
  }): Promise<Record<string, any[]>> {
    const { fromObjectType, toObjectType, ids } = params;
    
    if (ids.length === 0) {
      return {};
    }

    return withRetry(
      async () => {
        if (!this.client) {
          this.client = new Client({ accessToken: params.accessToken });
        }

        const batchInput = {
          inputs: ids.map(id => ({ id }))
        };

        const response = await this.client.crm.associations.batchApi.read(
          fromObjectType,
          toObjectType,
          batchInput
        );

        // Transform response into a map
        const associationsMap: Record<string, any[]> = {};
        response.results?.forEach(result => {
          const fromId = result._from?.id;
          if (fromId && result.to?.length > 0) {
            associationsMap[fromId] = result.to;
          }
        });

        return associationsMap;
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying HubSpot associations', { 
            error: error.message, 
            attempt 
          });
        }
      }
    );
  }

  /**
   * Get deals by IDs
   */
  async getDealsByIds(params: {
    accessToken: string;
    ids: string[];
  }): Promise<HubspotDeal[]> {
    const { ids } = params;
    
    if (ids.length === 0) {
      return [];
    }

    return withRetry(
      async () => {
        if (!this.client) {
          this.client = new Client({ accessToken: params.accessToken });
        }

        const batchReadInput = {
          propertiesWithHistory: [],
          idProperty: 'hs_object_id',
          inputs: ids.map(id => ({ id })),
          properties: [
            'dealname', 'pipeline', 'dealstage', 'amount',
            'closedate', 'createdate', 'hs_lastmodifieddate',
            'hubspot_owner_id'
          ]
        };

        const response = await this.client.crm.deals.batchApi.read(
          batchReadInput,
          false // archived
        );

        return response.results;
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying HubSpot deals batch', { 
            error: error.message, 
            attempt,
            dealsCount: ids.length 
          });
        }
      }
    );
  }

  /**
   * Search for contacts with filters
   */
  async searchContacts(params: {
    accessToken: string;
    filters: any[];
    properties?: string[];
    limit?: number;
    after?: string;
  }): Promise<HubspotPageResponse<HubspotContact>> {
    const { filters, properties = [], limit = 100, after = '0' } = params;

    return withRetry(
      async () => {
        if (!this.client) {
          this.client = new Client({ accessToken: params.accessToken });
        }

        const searchRequest = {
          filterGroups: [{ filters }],
          properties,
          limit,
          after
        };

        return await this.client.crm.contacts.searchApi.doSearch(searchRequest);
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('Retrying HubSpot search', { 
            error: error.message, 
            attempt 
          });
        }
      }
    );
  }
}
```

### FILE: src/repositories/es-repository.ts
```
/**
 * Repository for all Elasticsearch operations
 * Handles document indexing and queries
 */

import { Client } from '@elastic/elasticsearch';
import { Logger } from '../utils/logger';
import { getElasticSearchClient } from '../utils/es-client';
import * as crypto from 'crypto';

export class ElasticsearchRepository {
  private logger: Logger;
  private client: Client | null = null;
  private indexName: string;

  constructor({ logger }) {
    this.logger = logger;
    this.indexName = process.env.ES_INDEX_CONTACTS || 'contacts';
  }

  /**
   * Get or create Elasticsearch client
   */
  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = await getElasticSearchClient();
    }
    return this.client;
  }

  /**
   * Bulk index contacts
   */
  async bulkIndexContacts(contacts: any[]): Promise<{ indexed: number; errors: any[] }> {
    if (contacts.length === 0) {
      return { indexed: 0, errors: [] };
    }

    const client = await this.getClient();
    const bulkOps = this.prepareBulkOperations(contacts);

    try {
      const response = await client.bulk({
        pipeline: 'contacts_pipeline',
        body: bulkOps
      });

      const errors = response.errors ? this.extractBulkErrors(response) : [];
      
      this.logger.info('Elasticsearch bulk index complete', {
        total: contacts.length,
        indexed: contacts.length - errors.length,
        errors: errors.length
      });

      return {
        indexed: contacts.length - errors.length,
        errors
      };

    } catch (error) {
      this.logger.error('Elasticsearch bulk index failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Index a single contact
   */
  async indexContact(contact: any): Promise<void> {
    const client = await this.getClient();
    const id = this.generateDocumentId(contact);
    const doc = this.prepareDocument(contact);

    try {
      await client.index({
        index: this.indexName,
        id,
        body: doc,
        pipeline: 'contacts_pipeline'
      });

      this.logger.debug('Contact indexed', { id, businessId: contact.businessid });

    } catch (error) {
      this.logger.error('Failed to index contact', { 
        error: error.message, 
        id,
        businessId: contact.businessid 
      });
      throw error;
    }
  }

  /**
   * Delete contacts by business ID
   */
  async deleteContactsByBusiness(businessId: number): Promise<{ deleted: number }> {
    const client = await this.getClient();

    try {
      const response = await client.deleteByQuery({
        index: this.indexName,
        body: {
          query: {
            term: { businessid: businessId }
          }
        }
      });

      this.logger.info('Contacts deleted', { 
        businessId, 
        deleted: response.deleted 
      });

      return { deleted: response.deleted || 0 };

    } catch (error) {
      this.logger.error('Failed to delete contacts', { 
        error: error.message, 
        businessId 
      });
      throw error;
    }
  }

  /**
   * Update contacts with deals data
   */
  async bulkUpdateDeals(updates: Array<{ contactId: string; businessId: number; deals: any }>) {
    const bulkOps = [];
    
    for (const update of updates) {
      const docId = this.generateDocumentId({
        businessid: update.businessId,
        externalid: update.contactId
      });
      
      bulkOps.push({
        update: { _index: this.indexName, _id: docId }
      });
      
      bulkOps.push({
        doc: {
          deals: update.deals,
          dealsSyncedAt: new Date().toISOString()
        },
        retry_on_conflict: 3
      });
    }
    
    if (bulkOps.length > 0) {
      const client = await this.getClient();
      await client.bulk({ body: bulkOps });
    }
  }

  /**
   * Search contacts
   */
  async searchContacts(params: {
    businessId: number;
    query?: string;
    filters?: any;
    from?: number;
    size?: number;
  }): Promise<{ hits: any[]; total: number }> {
    const client = await this.getClient();
    const { businessId, query, filters = {}, from = 0, size = 50 } = params;

    const must: any[] = [
      { term: { businessid: businessId } }
    ];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['name.firstName', 'name.lastName', 'emails.email', 'phones.phone']
        }
      });
    }

    // Add additional filters
    Object.entries(filters).forEach(([field, value]) => {
      must.push({ term: { [field]: value } });
    });

    try {
      const response = await client.search({
        index: this.indexName,
        from,
        size,
        body: {
          query: {
            bool: { must }
          },
          sort: [
            { 'created_at': 'desc' }
          ]
        }
      });

      return {
        hits: response.hits.hits.map(hit => ({
          id: hit._id,
          ...hit._source
        })),
        total: response.hits.total.value
      };

    } catch (error) {
      this.logger.error('Search failed', { 
        error: error.message, 
        businessId, 
        query 
      });
      throw error;
    }
  }

  /**
   * Prepare bulk operations for indexing
   */
  private prepareBulkOperations(contacts: any[]): any[] {
    const operations: any[] = [];
    
    for (const contact of contacts) {
      const id = this.generateDocumentId(contact);
      const doc = this.prepareDocument(contact);
      
      operations.push({
        update: {
          _index: this.indexName,
          _id: id
        }
      });
      
      operations.push({
        doc,
        upsert: doc
      });
    }
    
    return operations;
  }

  /**
   * Generate unique document ID for a contact
   */
  private generateDocumentId(contact: any): string {
    const idString = `${contact.businessid}-16-${contact.externalid}`;
    return crypto.createHash('sha256').update(idString).digest('hex');
  }

  /**
   * Prepare document for indexing
   */
  private prepareDocument(contact: any): any {
    // Remove raw data and prepare for indexing
    const doc = { ...contact };
    delete doc.rawContact;
    delete doc.rawDeals;
    
    // Add timestamp if not present
    if (!doc.created_at) {
      doc.created_at = new Date().toISOString();
    }
    
    // Ensure required fields
    doc.indexed_at = new Date().toISOString();
    
    return doc;
  }

  /**
   * Extract errors from bulk response
   */
  private extractBulkErrors(response: any): any[] {
    const errors: any[] = [];
    
    response.items?.forEach((item: any) => {
      const operation = item.update || item.index;
      if (operation?.error) {
        errors.push({
          id: operation._id,
          error: operation.error
        });
      }
    });
    
    return errors;
  }
}
```

### FILE: src/transformers/contact-transformer.ts
```
/**
 * Transform HubSpot contacts to internal format
 * Handles data mapping and phone number conversion
 */

import { convertToe164 } from '../utils/phone-utils';
import { HubspotContact, HubspotDeal } from '../types/hubspot-types';
import * as _ from 'lodash';

export class ContactTransformer {
  private businessId: number;
  private portalId: string;

  constructor({ businessId, portalId }) {
    this.businessId = businessId;
    this.portalId = portalId;
  }

  /**
   * Transform HubSpot contact to internal format
   */
  transformContact(params: {
    contact: HubspotContact;
    deals: HubspotDeal[];
    ownerMap: Record<string, string>;
  }): any {
    const { contact, deals, ownerMap } = params;
    const p = contact.properties || {};
    
    const transformed: any = {
      // Metadata
      acmecrmid: '16',
      crmname: 'hubspot',
      businessid: this.businessId,
      externalid: parseInt(contact.id),
      created_at: this.formatDate(new Date()),
      
      // Raw data for reference
      rawContact: contact,
      rawDeals: deals,
      
      // Initialize structures
      name: {},
      company: {},
      emails: [],
      phones: [],
      phone164: [],
      addresses: [],
      crmlinks: {},
      deals: {},
      
      // Owner mapping
      ownerid: p.hubspot_owner_id || '',
      acmeownerid: ''
    };

    // Map owner ID
    if (transformed.ownerid && ownerMap[transformed.ownerid]) {
      transformed.acmeownerid = ownerMap[transformed.ownerid].toString();
    }

    // Name
    if (p.firstname) transformed.name.firstName = p.firstname;
    if (p.lastname) transformed.name.lastName = p.lastname;

    // Company
    if (p.associatedcompanyid) {
      transformed.company.id = p.associatedcompanyid;
    }
    if (p.company) {
      transformed.company.name = p.company;
    }

    // Email
    if (p.email) {
      transformed.emails.push({ 
        type: 'primary', 
        email: p.email 
      });
    }

    // Phones
    if (p.phone) {
      transformed.phones.push({ 
        type: 'phone', 
        phone: p.phone 
      });
    }
    if (p.mobilephone) {
      transformed.phones.push({ 
        type: 'mobile', 
        phone: p.mobilephone 
      });
    }

    // Address
    if (p.address || p.city || p.state || p.zip) {
      transformed.addresses.push({
        type: 'primary',
        address: {
          street: p.address || '',
          city: p.city || '',
          state: p.state || '',
          zip: p.zip || ''
        }
      });
    }

    // CRM link
    transformed.crmlinks.weblink = 
      `https://app.hubspot.com/contacts/${this.portalId}/contact/${contact.id}/`;

    // Process deals
    if (deals && deals.length > 0) {
      const transformedDeals = this.transformDeals(deals);
      
      // Store the most recent open deal, or the most recent deal if no open deals
      const openDeals = transformedDeals.filter(d => d.acmeStatus === 'open');
      if (openDeals.length > 0) {
        transformed.deals = openDeals.sort((a, b) => 
          (b.lastModified || '').localeCompare(a.lastModified || '')
        )[0];
      } else if (transformedDeals.length > 0) {
        transformed.deals = transformedDeals[0];
      }
    }

    return transformed;
  }

  /**
   * Transform HubSpot deals
   */
  private transformDeals(deals: HubspotDeal[]): any[] {
    return deals.map(deal => {
      const p = deal.properties || {};
      
      return {
        id: deal.id,
        pipeline: p.pipeline,
        stage: p.dealstage,
        link: `https://app.hubspot.com/deals/${this.portalId}/deal/${deal.id}/`,
        name: p.dealname,
        title: p.title,
        ownerid: p.hubspot_owner_id,
        created: p.createdate,
        lastModified: p.hs_lastmodifieddate,
        value: Number(p.amount) || 0,
        acmeStatus: this.getDealStatus(p.dealstage)
      };
    });
  }

  /**
   * Determine deal status based on stage
   */
  private getDealStatus(stage: string): string {
    const closedStages = ['lost', 'won', 'closed'];
    return closedStages.includes(stage?.toLowerCase()) ? 'closed' : 'open';
  }

  /**
   * Convert phone numbers to E164 format
   */
  convertPhoneNumbers(contact: any): any {
    const converted = { ...contact };
    
    if (converted.phones && converted.phones.length > 0) {
      converted.phone164 = converted.phones.map(phoneObj => {
        const e164 = convertToe164(phoneObj.phone);
        return {
          type: phoneObj.type,
          phone: e164,
          original: phoneObj.phone
        };
      });
    }
    
    return converted;
  }

  /**
   * Format date for database
   */
  private formatDate(date: Date): string {
    const pad = (num: number) => num.toString().padStart(2, '0');
    
    return (
      [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
      ].join('-') +
      ' ' +
      [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
      ].join(':')
    );
  }
}
```

### FILE: src/utils/retry.ts
```
/**
 * Retry utility for handling transient failures
 * Implements exponential backoff with jitter
 */

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number) => void;
  retryCondition?: (error: Error) => boolean;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = () => {},
    retryCondition = (error) => {
      // Retry on rate limits and network errors
      const retryableCodes = [429, 502, 503, 504];
      return retryableCodes.includes(error['response']?.status);
    }
  } = options;

  let lastError: Error;
  let delay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !retryCondition(lastError)) {
        throw lastError;
      }

      onRetry(lastError, attempt + 1);

      // Calculate delay with exponential backoff and jitter
      const jitter = Math.random() * 1000;
      const actualDelay = Math.min(delay + jitter, maxDelay);
      
      // Handle rate limit headers if present
      const retryAfter = error['response']?.headers?.['retry-after'];
      if (retryAfter) {
        const retryDelayMs = parseInt(retryAfter) * 1000;
        await sleep(retryDelayMs);
      } else {
        await sleep(actualDelay);
      }

      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### FILE: src/utils/token-manager.ts
```
/**
 * Manage OAuth tokens for HubSpot API
 * Handles token refresh and caching
 */

import axios from 'axios';
import { DateTime } from 'luxon';
import * as dbPool from './db-pool';
import { Logger } from './logger';
import { OAuth } from '../types/hubspot-types';

export class TokenManager {
  private logger: Logger;
  private tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();

  constructor({ logger }) {
    this.logger = logger || new Logger({ component: 'TokenManager' });
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary
   */
  async ensureValidToken(oauth: OAuth): Promise<string> {
    const cacheKey = `${oauth.businessid}-${oauth.token}`;
    
    // Check cache first
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.token;
    }

    // Check if current token is still valid
    if (oauth.accessToken && oauth.tokenvaliduntil) {
      const tokenExpiry = new Date(oauth.tokenvaliduntil);
      if (tokenExpiry > new Date()) {
        // Cache the valid token
        this.tokenCache.set(cacheKey, {
          token: oauth.accessToken,
          expiresAt: tokenExpiry
        });
        return oauth.accessToken;
      }
    }

    // Need to refresh the token
    return await this.refreshToken(oauth);
  }

  /**
   * Refresh the OAuth token
   */
  private async refreshToken(oauth: OAuth): Promise<string> {
    if (!oauth.token) {
      throw new Error('Missing refresh token');
    }

    const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
    const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
    const REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI!,
      refresh_token: oauth.token
    });

    try {
      const response = await axios.post(
        'https://api.hubapi.com/oauth/v1/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token } = response.data;
      
      // Calculate expiration (30 minutes from now, with 1 minute buffer)
      const expiresAt = DateTime.now().plus({ minutes: 29 }).toJSDate();

      // Update database
      await this.updateTokenInDatabase(
        oauth.businessid,
        access_token,
        expiresAt
      );

      // Cache the new token
      const cacheKey = `${oauth.businessid}-${oauth.token}`;
      this.tokenCache.set(cacheKey, {
        token: access_token,
        expiresAt
      });

      this.logger.info('Token refreshed successfully', { 
        businessId: oauth.businessid 
      });

      return access_token;

    } catch (error) {
      this.logger.error('Failed to refresh token', { 
        error: error.message,
        businessId: oauth.businessid 
      });
      throw error;
    }
  }

  /**
   * Update token in database
   */
  private async updateTokenInDatabase(
    businessId: number,
    accessToken: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      await dbPool.query('call updateUserCrmTokens2(?,?,?,?)', [
        null, // userId will be determined by businessId
        16, // HubSpot CRM ID
        accessToken,
        expiresAt.toISOString()
      ]);
    } catch (error) {
      this.logger.error('Failed to update token in database', { 
        error: error.message,
        businessId 
      });
      // Don't throw - we have the token, just couldn't persist it
    }
  }

  /**
   * Clear token cache
   */
  clearCache(): void {
    this.tokenCache.clear();
  }
}
```

### FILE: src/types/hubspot-types.ts
```
/**
 * TypeScript type definitions for HubSpot sync
 */

export interface THubspotWebhookRequest {
  test?: any;
  userId?: number;
  crmID?: string;
  ids?: string[];
  portalid?: string;
  contactSyncId?: string;
  processedCounter: number;
  contactCounter: number;
  hasMore?: boolean;
  offset: string;
  oauth: OAuth;
  externalOwnersToacmeUsersMap?: Record<string, string>;
  recursionCounter?: number;
}

export interface OAuth {
  businessid: number;
  businessId?: number;
  accessToken?: string;
  token: string;
  apiKey?: string;
  tokenvaliduntil?: Date | string;
}

export interface HubspotContact {
  id: string;
  properties: Record<string, any>;
  associations?: {
    deals?: {
      results: Array<{
        id: string;
        type: string;
      }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface HubspotDeal {
  id: string;
  properties: Record<string, any>;
  associations?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface HubspotPageResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
      link?: string;
    };
  };
}

export interface SyncResult {
  completed: boolean;
  processedCount: number;
  error?: string;
}

export interface TransformedContact {
  acmecrmid: string;
  crmname: string;
  businessid: number;
  externalid: number;
  created_at: string;
  name: {
    firstName?: string;
    lastName?: string;
  };
  company: {
    id?: string;
    name?: string;
  };
  emails: Array<{
    type: string;
    email: string;
  }>;
  phones: Array<{
    type: string;
    phone: string;
  }>;
  phone164: Array<{
    type: string;
    phone: string;
    original?: string;
  }>;
  addresses: Array<{
    type: string;
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  }>;
  crmlinks: {
    weblink?: string;
  };
  deals: any;
  ownerid: string;
  acmeownerid: string;
  rawContact?: HubspotContact;
  rawDeals?: HubspotDeal[];
}
```