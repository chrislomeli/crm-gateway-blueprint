/**
 * Repository for all Elasticsearch operations
 * Handles document indexing and queries using OpenSearchService
 */

import { OpenSearchService, TenantIndexManager } from '@platform/connectors';
import { Result, Success, Failure, success, failure, createError, AppErrorType, tryResultAsync, getErrorInfo } from '@platform/core';
import { logger } from '@platform/core';
import * as crypto from 'crypto';

export class ElasticsearchRepository {

  private tenantIndexManager: TenantIndexManager;

  constructor() {
    this.tenantIndexManager =  TenantIndexManager.getInstance();
  }

  /**
   * Get tenant-specific index name for contacts
   */
  private getContactsIndexName(businessId: string): string {
    return TenantIndexManager.generateIndexName(businessId, 'contacts');
  }

  /**
   * Bulk index contacts using OpenSearchService with Result pattern
   */
  async bulkIndexContacts(contacts: any[], businessId: string): Promise<Result<{ indexed: number; errors: any[] }>> {
    return tryResultAsync(async () => {
      if (contacts.length === 0) {
        return { indexed: 0, errors: [] };
      }

      // Ensure tenant index exists
      const indexResult = await this.tenantIndexManager.getOrCreateContactsIndex(businessId);
      if (!indexResult.success) {
        const errorInfo = getErrorInfo(indexResult);
        throw new Error(`Failed to create contacts index: ${errorInfo.message}`);
      }

      const bulkOps = this.prepareBulkOperations(contacts, businessId);
      const bulkResult = await OpenSearchService.bulk(bulkOps);
      
      if (!bulkResult.success) {
        const errorInfo = getErrorInfo(bulkResult);
        throw new Error(`Bulk operation failed: ${errorInfo.message}`);
      }

      const errors = bulkResult.data.errors ? this.extractBulkErrors(bulkResult.data) : [];
      
      logger.info({
        businessId,
        total: contacts.length,
        indexed: contacts.length - errors.length,
        errors: errors.length
      }, 'Elasticsearch bulk index complete');

      return {
        indexed: contacts.length - errors.length,
        errors
      };
    }, AppErrorType.DATABASE_ERROR, {
      operation: 'bulkIndexContacts',
      data: { businessId, contactCount: contacts.length }
    });
  }

  /**
   * Index a single contact using OpenSearchService with Result pattern
   */
  async indexContact(contact: any): Promise<Result<void>> {
    return tryResultAsync(async () => {
      const businessId = contact.businessid.toString();
      const indexName = this.getContactsIndexName(businessId);
      const id = this.generateDocumentId(contact);
      const doc = this.prepareDocument(contact);

      // Ensure tenant index exists
      const indexResult = await this.tenantIndexManager.getOrCreateContactsIndex(businessId);
      if (!indexResult.success) {
        const errorInfo = getErrorInfo(indexResult);
        throw new Error(`Failed to create contacts index: ${errorInfo.message}`);
      }

      const result = await OpenSearchService.index(indexName, doc, id);
      if (!result.success) {
        const errorInfo = getErrorInfo(result);
        throw new Error(`Failed to index contact: ${errorInfo.message}`);
      }

      logger.debug({ id, businessId }, 'Contact indexed');
    }, AppErrorType.DATABASE_ERROR, {
      operation: 'indexContact',
      data: { businessId: contact.businessid, contactId: contact.externalid }
    });
  }

  /**
   * Delete contacts by business ID using OpenSearchService with Result pattern
   */
  async deleteContactsByBusiness(businessId: number): Promise<Result<{ deleted: number }>> {
    return tryResultAsync(async () => {
      const businessIdStr = businessId.toString();
      const indexName = this.getContactsIndexName(businessIdStr);

      // Use search to find documents, then delete by ID (more reliable than deleteByQuery)
      const searchResult = await OpenSearchService.search(indexName, {
        query: {
          term: { businessid: businessId }
        },
        size: 10000 // Adjust based on expected volume
      });

      if (!searchResult.success) {
        const errorInfo = getErrorInfo(searchResult);
        throw new Error(`Failed to search contacts: ${errorInfo.message}`);
      }

      if (searchResult.data.hits.length === 0) {
        logger.info({ businessId }, 'No contacts found to delete');
        return { deleted: 0 };
      }

      // Prepare bulk delete operations
      const bulkOps = [];
      for (const hit of searchResult.data.hits) {
        bulkOps.push({
          delete: { _index: indexName, _id: hit._id }
        });
      }

      const bulkResult = await OpenSearchService.bulk(bulkOps);
      if (!bulkResult.success) {
        const errorInfo = getErrorInfo(bulkResult);
        throw new Error(`Bulk delete failed: ${errorInfo.message}`);
      }

      const deleted = searchResult.data.hits.length;
      logger.info({ businessId, deleted }, 'Contacts deleted');

      return { deleted };
    }, AppErrorType.DATABASE_ERROR, {
      operation: 'deleteContactsByBusiness',
      data: { businessId }
    });
  }

  /**
   * Update contacts with deals data using OpenSearchService with Result pattern
   */
  async bulkUpdateDeals(updates: Array<{ contactId: string; businessId: number; deals: any }>): Promise<Result<void>> {
    return tryResultAsync(async () => {
      if (updates.length === 0) {
        return;
      }

      // Group updates by business ID for multi-tenant support
      const updatesByBusiness = new Map<string, typeof updates>();
      for (const update of updates) {
        const businessIdStr = update.businessId.toString();
        if (!updatesByBusiness.has(businessIdStr)) {
          updatesByBusiness.set(businessIdStr, []);
        }
        updatesByBusiness.get(businessIdStr)!.push(update);
      }

      // Process each business separately
      for (const [businessIdStr, businessUpdates] of updatesByBusiness) {
        const indexName = this.getContactsIndexName(businessIdStr);
        const bulkOps = [];
        
        for (const update of businessUpdates) {
          const docId = this.generateDocumentId({
            businessid: update.businessId,
            externalid: update.contactId
          });
          
          bulkOps.push({
            update: { _index: indexName, _id: docId }
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
          const bulkResult = await OpenSearchService.bulk(bulkOps);
          if (!bulkResult.success) {
            const errorInfo = getErrorInfo(bulkResult);
            throw new Error(`Bulk update deals failed for business ${businessIdStr}: ${errorInfo.message}`);
          }
        }
      }
    }, AppErrorType.DATABASE_ERROR, {
      operation: 'bulkUpdateDeals',
      data: { updateCount: updates.length }
    });
  }

  /**
   * Search contacts using OpenSearchService with Result pattern
   */
  async searchContacts(params: {
    businessId: number;
    query?: string;
    filters?: any;
    from?: number;
    size?: number;
  }): Promise<Result<{ hits: any[]; total: number }>> {
    return tryResultAsync(async () => {
      const { businessId, query, filters = {}, from = 0, size = 50 } = params;
      const businessIdStr = businessId.toString();
      const indexName = this.getContactsIndexName(businessIdStr);

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

      const searchQuery = {
        query: {
          bool: { must }
        },
        sort: [
          { 'created_at': 'desc' }
        ]
      };

      const searchResult = await OpenSearchService.search(indexName, searchQuery, { from, size });
      if (!searchResult.success) {
        const errorInfo = getErrorInfo(searchResult);
        throw new Error(`Search failed: ${errorInfo.message}`);
      }

      return {
        hits: searchResult.data.hits.map(hit => ({
          id: hit._id,
          ...hit
        })),
        total: searchResult.data.total
      };
    }, AppErrorType.DATABASE_ERROR, {
      operation: 'searchContacts',
      data: { businessId: params.businessId, query: params.query }
    });
  }

  /**
   * Prepare bulk operations for indexing with multi-tenant support
   */
  private prepareBulkOperations(contacts: any[], businessId: string): any[] {
    const operations: any[] = [];
    const indexName = this.getContactsIndexName(businessId);
    
    for (const contact of contacts) {
      const id = this.generateDocumentId(contact);
      const doc = this.prepareDocument(contact);
      
      operations.push({
        update: {
          _index: indexName,
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
