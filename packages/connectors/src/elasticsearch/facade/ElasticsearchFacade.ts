/**
 * Elasticsearch Facade - Context-aware operations
 * 
 * This facade automatically resolves index names based on operation context:
 * - prefix (e.g., 'contacts', 'deals') 
 * - businessId (tenant isolation)
 * - crmId (future: CRM-specific isolation)
 * 
 * Developers just call operations with context - no instantiation needed.
 * 
 * Usage:
 *   await ElasticsearchFacade.indexContact(businessId, crmId, contactData);
 *   await ElasticsearchFacade.searchContacts(businessId, crmId, query);
 *   await ElasticsearchFacade.getContact(businessId, crmId, contactId);
 */

import { Result, success, failure, createError, ApplicationContext } from '@platform/core';
import { TenantIndexManager } from '../managers';
import { OpenSearchService } from '../core';
import { logger } from '@platform/core';
import { createDatabaseObservable } from '@platform/infrastructure';

export interface SearchOptions {
  size?: number;
  from?: number;
  sort?: any;
  _source?: any;
}

export interface IndexOptions {
  id?: string;
  refresh?: boolean;
}

/**
 * Elasticsearch Facade with context-aware operations
 */
export class ElasticsearchFacade {
  private static tenantManager: TenantIndexManager = TenantIndexManager.getInstance();
  private static log = logger;

  /**
   * Resolve index name from context
   * Future: will incorporate crmId for CRM-specific isolation
   */
  private static resolveIndexName(prefix: string, businessId: string, crmId?: number): string {
    // For now, use existing TenantIndexManager logic
    // Future: extend to handle crmId-based isolation
    return this.tenantManager.generateIndexName(businessId, prefix);
  }

  /**
   * Create application context for observability
   */
  private static createContext(
    operation: string, 
    businessId: string | number, 
    crmId?: number,
    additionalMetadata?: any
  ): ApplicationContext {
    return {
      identity: {
        appName: 'database',
        namespace: 'elasticsearch',
        integration: String(businessId),
        operation: operation
      },
      globalConfigs: {
        businessId: String(businessId),
        crmId,
        operation,
        ...additionalMetadata
      }
    };
  }

  // ===== CONTACT OPERATIONS =====

  /**
   * Index a contact document
   */
  public static async indexContact(
    businessId: string,
    crmId: number,
    contactData: any,
    options?: IndexOptions
  ): Promise<Result<any>> {
    const context = this.createContext('indexContact', businessId, crmId, {
      hasId: !!options?.id,
      refresh: options?.refresh,
      prefix: 'contacts'
    });

    const observableIndexContact = createDatabaseObservable(
      context,
      'elasticsearch.indexContact',
      async () => {
        const indexName = this.resolveIndexName('contacts', businessId, crmId);
        
        // Ensure index exists before writing
        const ensureResult = await this.ensureIndex('contacts', businessId, crmId);
        if (!ensureResult.success) {
          return failure(createError({
            name: 'IndexContactError',
            message: 'Failed to ensure contacts index exists',
            cause: ensureResult.error
          }));
        }
        
        this.log.debug({
          businessId,
          crmId,
          indexName,
          contactId: options?.id
        }, 'Indexing contact');

        return await OpenSearchService.index(indexName, contactData, options?.id);
      }
    );

    return observableIndexContact();
  }

  /**
   * Get a contact by ID
   */
  public static async getContact(
    businessId: string | number,
    crmId: number,
    contactId: string
  ): Promise<Result<any>> {
    const context = this.createContext('getContact', businessId, crmId, {
      contactId,
      prefix: 'contacts'
    });

    const observableGetContact = createDatabaseObservable(
      context,
      'elasticsearch.getContact',
      async () => {
        const indexName = this.resolveIndexName('contacts', String(businessId), crmId);
        
        this.log.debug({
          businessId,
          crmId,
          indexName,
          contactId
        }, 'Getting contact');

        return await OpenSearchService.get(indexName, contactId);
      }
    );

    return observableGetContact();
  }

  /**
   * Search contacts
   */
  public static async searchContacts(
    businessId: string,
    crmId: number,
    query: any,
    options?: SearchOptions
  ): Promise<Result<any>> {
    const context = this.createContext('searchContacts', businessId, crmId, {
      hasQuery: !!query,
      size: options?.size || 10,
      from: options?.from || 0,
      hasSort: !!options?.sort,
      prefix: 'contacts'
    });

    const observableSearchContacts = createDatabaseObservable(
      context,
      'elasticsearch.searchContacts',
      async () => {
        const indexName = this.resolveIndexName('contacts', businessId, crmId);
        
        const searchQuery = {
          query,
          size: options?.size || 10,
          from: options?.from || 0,
          ...(options?.sort && { sort: options.sort }),
          ...(options?._source !== undefined && { _source: options._source })
        };

        this.log.debug({
          businessId,
          crmId,
          indexName,
          querySize: searchQuery.size
        }, 'Searching contacts');

        return await OpenSearchService.search(indexName, searchQuery);
      }
    );

    return observableSearchContacts();
  }

  /**
   * Update a contact
   */
  public static async updateContact(
    businessId: string,
    crmId: number,
    contactId: string,
    updateData: any
  ): Promise<Result<any>> {
    const context = this.createContext('updateContact', businessId, crmId, {
      contactId,
      hasUpdateData: !!updateData,
      prefix: 'contacts'
    });

    const observableUpdateContact = createDatabaseObservable(
      context,
      'elasticsearch.updateContact',
      async () => {
        const indexName = this.resolveIndexName('contacts', businessId, crmId);
        
        // Ensure index exists before updating
        const ensureResult = await this.ensureIndex('contacts', businessId, crmId);
        if (!ensureResult.success) {
          return failure(createError({
            name: 'UpdateContactError',
            message: 'Failed to ensure contacts index exists',
            cause: ensureResult.error
          }));
        }
        
        this.log.debug({
          businessId,
          crmId,
          indexName,
          contactId
        }, 'Updating contact');

        return await OpenSearchService.update(indexName, contactId, updateData);
      }
    );

    return observableUpdateContact();
  }

  /**
   * Delete a contact
   */
  public static async deleteContact(
    businessId: string,
    crmId: number,
    contactId: string
  ): Promise<Result<any>> {
    const context = this.createContext('deleteContact', businessId, crmId, {
      contactId,
      prefix: 'contacts'
    });

    const observableDeleteContact = createDatabaseObservable(
      context,
      'elasticsearch.deleteContact',
      async () => {
        const indexName = this.resolveIndexName('contacts', businessId, crmId);
        
        // Ensure index exists before deleting
        const ensureResult = await this.ensureIndex('contacts', businessId, crmId);
        if (!ensureResult.success) {
          return failure(createError({
            name: 'DeleteContactError',
            message: 'Failed to ensure contacts index exists',
            cause: ensureResult.error
          }));
        }
        
        this.log.debug({
          businessId,
          crmId,
          indexName,
          contactId
        }, 'Deleting contact');

        return await OpenSearchService.delete(indexName, contactId);
      }
    );

    return observableDeleteContact();
  }

  // ===== DEAL OPERATIONS =====

  /**
   * Index a deal document
   */
  public static async indexDeal(
    businessId: string,
    crmId: number,
    dealData: any,
    options?: IndexOptions
  ): Promise<Result<any>> {
    const context = this.createContext('indexDeal', businessId, crmId, {
      hasId: !!options?.id,
      refresh: options?.refresh,
      prefix: 'deals'
    });

    const observableIndexDeal = createDatabaseObservable(
      context,
      'elasticsearch.indexDeal',
      async () => {
        const indexName = this.resolveIndexName('deals', businessId, crmId);
        
        // Ensure index exists before writing
        const ensureResult = await this.ensureIndex('deals', businessId, crmId);
        if (!ensureResult.success) {
          return failure(createError({
            name: 'IndexDealError',
            message: 'Failed to ensure deals index exists',
            cause: ensureResult.error
          }));
        }
        
        this.log.debug({
          businessId,
          crmId,
          indexName,
          dealId: options?.id
        }, 'Indexing deal');

        return await OpenSearchService.index(indexName, dealData, options?.id);
      }
    );

    return observableIndexDeal();
  }

  /**
   * Search deals
   */
  public static async searchDeals(
    businessId: string,
    crmId: number,
    query: any,
    options?: SearchOptions
  ): Promise<Result<any>> {
    const context = this.createContext('searchDeals', businessId, crmId, {
      hasQuery: !!query,
      size: options?.size || 10,
      from: options?.from || 0,
      hasSort: !!options?.sort,
      prefix: 'deals'
    });

    const observableSearchDeals = createDatabaseObservable(
      context,
      'elasticsearch.searchDeals',
      async () => {
        const indexName = this.resolveIndexName('deals', businessId, crmId);
        
        const searchQuery = {
          query,
          size: options?.size || 10,
          from: options?.from || 0,
          ...(options?.sort && { sort: options.sort }),
          ...(options?._source !== undefined && { _source: options._source })
        };

        this.log.debug({
          businessId,
          crmId,
          indexName,
          querySize: searchQuery.size
        }, 'Searching deals');

        return await OpenSearchService.search(indexName, searchQuery);
      }
    );

    return observableSearchDeals();
  }

  // ===== GENERIC OPERATIONS =====

  /**
   * Generic document indexing for any prefix
   */
  public static async indexDocument(
    prefix: string,
    businessId: string,
    crmId: number,
    document: any,
    options?: IndexOptions
  ): Promise<Result<any>> {
    const context = this.createContext('indexDocument', businessId, crmId, {
      prefix,
      hasId: !!options?.id,
      refresh: options?.refresh
    });

    const observableIndexDocument = createDatabaseObservable(
      context,
      'elasticsearch.indexDocument',
      async () => {
        const indexName = this.resolveIndexName(prefix, businessId, crmId);
        
        // Ensure index exists before writing
        const ensureResult = await this.ensureIndex(prefix, businessId, crmId);
        if (!ensureResult.success) {
          return failure(createError({
            name: 'IndexDocumentError',
            message: `Failed to ensure ${prefix} index exists`,
            cause: ensureResult.error
          }));
        }
        
        this.log.debug({
          prefix,
          businessId,
          crmId,
          indexName,
          documentId: options?.id
        }, 'Indexing document');

        return await OpenSearchService.index(indexName, document, options?.id);
      }
    );

    return observableIndexDocument();
  }

  /**
   * Generic document search for any prefix
   */
  public static async searchDocuments(
    prefix: string,
    businessId: string,
    crmId: number,
    query: any,
    options?: SearchOptions
  ): Promise<Result<any>> {
    const context = this.createContext('searchDocuments', businessId, crmId, {
      prefix,
      hasQuery: !!query,
      size: options?.size || 10,
      from: options?.from || 0,
      hasSort: !!options?.sort
    });

    const observableSearchDocuments = createDatabaseObservable(
      context,
      'elasticsearch.searchDocuments',
      async () => {
        const indexName = this.resolveIndexName(prefix, businessId, crmId);
        
        const searchQuery = {
          query,
          size: options?.size || 10,
          from: options?.from || 0,
          ...(options?.sort && { sort: options.sort }),
          ...(options?._source !== undefined && { _source: options._source })
        };

        this.log.debug({
          prefix,
          businessId,
          crmId,
          indexName,
          querySize: searchQuery.size
        }, 'Searching documents');

        return await OpenSearchService.search(indexName, searchQuery);
      }
    );

    return observableSearchDocuments();
  }

  // ===== UTILITY OPERATIONS =====

  /**
   * Get a generic document by ID
   */
  public static async getDocument(
    prefix: string,
    businessId: string,
    crmId: number,
    documentId: string
  ): Promise<Result<any>> {
    const context = this.createContext('getDocument', businessId, crmId, {
      prefix,
      documentId
    });

    const observableGetDocument = createDatabaseObservable(
      context,
      'elasticsearch.getDocument',
      async () => {
        const indexName = this.resolveIndexName(prefix, businessId, crmId);
        
        this.log.debug({
          prefix,
          businessId,
          crmId,
          indexName,
          documentId
        }, 'Getting document');

        return await OpenSearchService.get(indexName, documentId);
      }
    );

    return observableGetDocument();
  }

  /**
   * Generate a deterministic contact ID based on business ID, CRM ID, and external ID
   * This ensures consistent document IDs for contact replacement operations
   */
  public static generateContactId(businessId: number, acmeCrmId: number, externalId: number): string | null {
    return OpenSearchService.generateContactId(businessId, acmeCrmId, externalId);
  }

  /**
   * Ensure index exists for given context
   */
  public static async ensureIndex(
    prefix: string,
    businessId: string,
    crmId: number
  ): Promise<Result<any>> {
    const context = this.createContext('ensureIndex', businessId, crmId, {
      prefix
    });

    const observableEnsureIndex = createDatabaseObservable(
      context,
      'elasticsearch.ensureIndex',
      async () => {
        const indexName = this.resolveIndexName(prefix, businessId, crmId);
        
        // Check if index exists
        const existsResult = await OpenSearchService.indexExists(indexName);
        if (!existsResult.success) {
          return existsResult;
        }

        if (!existsResult.data) {
          // Create index using TenantIndexManager
          return await this.tenantManager.createTenantIndex(businessId, prefix);
        }

        // Index already exists - return consistent IndexOperationResult structure
        const result = {
          success: true,
          indexName,
          operation: 'create' as const,
          details: {
            businessId,
            indexType: prefix,
            alreadyExists: true
          }
        };

        return success(result);
      }
    );

    return observableEnsureIndex();
  }

  /**
   * Initialize Elasticsearch service with observability
   */
  public static async initialize(): Promise<Result<void>> {
    const context = this.createContext('initialize', 'system', 0, {
      operation: 'initialize'
    });

    const observableInitialize = createDatabaseObservable(
      context,
      'elasticsearch.initialize',
      async () => {
        this.log.debug('Initializing Elasticsearch service');
        return await OpenSearchService.initialize();
      }
    );

    return observableInitialize();
  }

  /**
   * Health check for Elasticsearch service with observability
   */
  public static async healthCheck(): Promise<Result<boolean>> {
    const context = this.createContext('healthCheck', 'system', 0, {
      operation: 'healthCheck'
    });

    const observableHealthCheck = createDatabaseObservable(
      context,
      'elasticsearch.healthCheck',
      async () => {
        this.log.debug('Performing Elasticsearch health check');
        return await OpenSearchService.healthCheck();
      }
    );

    return observableHealthCheck();
  }

  /**
   * List all indices - useful for connectivity and permission testing
   */
  public static async listIndices(): Promise<Result<any[]>> {
    const context = this.createContext('listIndices', 'system', 0, {
      operation: 'listIndices'
    });

    const observableListIndices = createDatabaseObservable(
      context,
      'elasticsearch.listIndices',
      async () => {
        this.log.debug('Listing Elasticsearch indices for connectivity test');
        return await OpenSearchService.listIndices();
      }
    );

    return observableListIndices();
  }
}
