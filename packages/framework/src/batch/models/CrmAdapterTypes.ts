/**
 * CrmAdapterTypes.ts - CRM Adapter Type Definitions
 *
 * This file defines the interfaces and types for CRM adapters in the batch processing framework.
 * It establishes a contract for all CRM adapters to follow, ensuring consistent behavior.
 *
 * What does this file do?
 * - Defines the CrmAdapter interface for transforming CRM data
 * - Specifies standard input and output formats
 * - Provides type definitions for adapter results
 *
 * How do you use it?
 * - Implement the CrmAdapter interface for each supported CRM
 * - Use these types to ensure type safety in the adapter implementations
 *
 * Why is this important?
 * - Ensures consistent behavior across different CRM adapters
 * - Provides clear contracts for adapter implementations
 * - Separates transformation logic from side effects
 *
 * @module common/framework/batch/models/CrmAdapterTypes
 */

/**
 * Standard output record format
 * This is the common format that all CRM adapters should transform their data to
 */
export interface StandardizedRecord {
  // Common fields that all records should have
  id?: string;
  businessId: string;
  source: string;
  
  // The original record data (preserved for reference)
  originalData: any;
  
  // The transformed data in a standardized format
  // This is intentionally flexible until we define a more specific schema
  data: Record<string, any>;
  
  // Metadata about the record
  metadata?: {
    timestamp?: string;
    processingTime?: number;
    [key: string]: any;
  };
}

/**
 * Result of adapter transformation
 */
export interface AdapterResult {
  // Successfully transformed records
  transformedRecords: StandardizedRecord[];
  
  // Records that failed transformation
  failedRecords: any[];
  
  // Detailed error information
  errors: Array<{
    record: any;
    error: string;
  }>;
}

/**
 * CRM Adapter interface
 * Defines the contract for all CRM adapters
 */
export interface CrmAdapter {
  /**
   * Transform a batch of records from a specific CRM format to the standardized format
   * @param records Array of records from the CRM
   * @param businessId Business ID associated with these records
   * @returns Transformation result with standardized records and errors
   */
  transformBatch(records: any[], businessId: string): Promise<AdapterResult>;
}
