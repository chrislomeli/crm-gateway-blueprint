/**
 * OpenSearch Core Types
 * 
 * This module defines TypeScript interfaces for low-level OpenSearch operations.
 * These types represent the direct responses from the OpenSearch/Elasticsearch client.
 */

/**
 * Response type for search queries
 */
export interface SearchQueryResult<T = any> {
  hits: T[];
  total: number;
  aggregations?: any;
}

/**
 * Response type for index operations
 */
export interface OpenSearchIndexResult {
  success: boolean;
  id?: string;
  version?: number;
  result?: string;
}

/**
 * Response type for bulk operations
 */
export interface OpenSearchOperationResult {
  success: boolean;
  items: any[];
  errors: boolean;
  took: number;
  affectedItems: number;
}
