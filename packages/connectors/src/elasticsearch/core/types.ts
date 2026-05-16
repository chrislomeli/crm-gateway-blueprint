/**
 * Types for Tenant Index Management
 * 
 * This module defines TypeScript interfaces and types for managing tenant-specific
 * Elasticsearch indices in the Blueprint CRM system.
 */

/**
 * Tenant isolation levels for index naming strategy
 * Using const assertion pattern for type safety and autocompletion
 */
export const TenantIsolationLevels = {
  /** Full tenant isolation - separate index per tenant */
  TENANT: 'tenant',
  /** CRM-level isolation - shared index across tenants within CRM */
  CRM: 'crm',
  /** No isolation - single shared index across all tenants */
  NONE: 'none'
} as const;

/**
 * Type derived from TenantIsolationLevels const object
 */
export type TenantIsolationLevel = typeof TenantIsolationLevels[keyof typeof TenantIsolationLevels];

/**
 * Configuration for tenant isolation behavior
 */
export interface TenantIsolationConfig {
  /** Level of tenant isolation for index naming */
  tenantIsolationLevel: TenantIsolationLevel;
}

/**
 * Configuration for tenant index operations
 */
export interface TenantIndexConfig {
  /** Number of primary shards for new indices */
  numberOfShards?: number;
  /** Number of replica shards for new indices */
  numberOfReplicas?: number;
  /** Refresh interval for the index */
  refreshInterval?: string;
  /** Maximum result window size */
  maxResultWindow?: number;
}

/**
 * Information about a tenant index
 */
export interface TenantIndexInfo {
  /** Full index name (e.g., "contacts-995") */
  indexName: string;
  /** Business ID of the tenant */
  businessId: string;
  /** Type of index (e.g., "contacts", "deals") */
  indexType: string;
  /** Whether the index exists */
  exists: boolean;
  /** Index settings if it exists */
  settings?: Record<string, any>;
  /** Index mapping if it exists */
  mapping?: Record<string, any>;
  /** Creation timestamp */
  createdAt?: Date;
  /** Document count */
  documentCount?: number;
  /** Index size in bytes */
  sizeInBytes?: number;
}

/**
 * Template information for index creation
 */
export interface IndexTemplate {
  /** Template name */
  name: string;
  /** Index pattern this template applies to */
  indexPattern: string;
  /** Template settings */
  settings: Record<string, any>;
  /** Template mappings */
  mappings: Record<string, any>;
  /** Template version */
  version?: number;
}

/**
 * Result of index operations
 */
export interface IndexOperationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Index name that was operated on */
  indexName: string;
  /** Operation type */
  operation: 'create' | 'delete' | 'update' | 'index';
  /** Additional details */
  details?: Record<string, any>;
}

/**
 * Options for listing tenant indices
 */
export interface ListTenantIndicesOptions {
  /** Filter by specific index type */
  indexType?: string;
  /** Include index statistics */
  includeStats?: boolean;
  /** Include index mappings */
  includeMappings?: boolean;
}

/**
 * Bulk operation for multiple tenant indices
 */
export interface BulkTenantIndexOperation {
  /** Business ID */
  businessId: string;
  /** Index type */
  indexType: string;
  /** Operation to perform */
  operation: 'create' | 'delete' | 'update' | 'index';
  /** Document ID for the operation */
  documentId?: string;
  /** Document data for index/update operations */
  document?: any;
  /** Configuration for index creation */
  config?: TenantIndexConfig;
  /** Operation options */
  options?: Record<string, any>;
}

/**
 * Result of bulk operations
 */
export interface BulkOperationResult {
  /** Total number of operations */
  total: number;
  /** Number of successful operations */
  successful: number;
  /** Number of failed operations */
  failed: number;
  /** Detailed errors */
  errors: Array<{ id: string; error: string }>;
  /** Time taken in milliseconds */
  took: number;
}

/**
 * Standard index types used in the CRM system
 */
export enum StandardIndexTypes {
  CONTACTS = 'contacts',
  DEALS = 'deals',
  ACTIVITIES = 'activities',
  COMPANIES = 'companies',
  NOTES = 'notes',
  TASKS = 'tasks',
  CALLS = 'calls',
  EMAILS = 'emails',
  MEETINGS = 'meetings',
  PRODUCTS = 'products',
  QUOTES = 'quotes',
  INVOICES = 'invoices',
  PAYMENTS = 'payments',
  ATTACHMENTS = 'attachments'
}

/**
 * Template types for index creation
 */
export enum TemplateTypes {
  CONTACTS = 'contacts-template',
  DEALS = 'deals-template',
  ACTIVITIES = 'activities-template',
  COMPANIES = 'companies-template',
  DEFAULT = 'default-template'
}
