/**
 * Elasticsearch Module Exports
 * 
 * This module provides a comprehensive set of Elasticsearch publishing and utilities
 * for the Blueprint CRM system. It includes core publishing, tenant management,
 * and specialized facades for different use cases.
 */

// Re-export core publishing
export * from './core';

// Re-export facade interfaces
export * from './facade';

// Re-export managers
export * from './managers';


/**
 * Service-Oriented Architecture Usage:
 * 
 * The Elasticsearch module is designed to be used in a service-oriented architecture.
 * Core publishing provide low-level functionality, while managers and facades provide
 * higher-level abstractions for specific use cases.
 * 
 * Example usage:
 * 
 * ```typescript
 * import { OpenSearchService, TenantIndexManager } from '@crm/data-publishing/elasticsearch';
 * 
 * // Use OpenSearchService for low-level operations
 * const searchResult = await OpenSearchService.search(...);
 * 
 * // Use TenantIndexManager for tenant-specific operations
 * const tenantManager = TenantIndexManager.getInstance();
 * await tenantManager.createTenantIndex('business-123', 'contacts');
 * ```
 */
