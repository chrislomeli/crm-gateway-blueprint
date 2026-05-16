/**
 * transformedData.ts - Transformed Data Model
 *
 * This file defines types and interfaces for representing data that has been transformed from CRM-specific formats
 * to a common structure for processing in the batch system.
 *
 * What does this file do?
 * - Defines TransformedData and TransformedRecord interfaces
 * - Standardizes how transformed CRM data is represented
 *
 * How do you use it?
 * - Use these types to type your transformed data in processors
 * - Extend as needed for new CRM data fields
 *
 * Why is this important?
 * - Ensures data consistency across CRM integrations
 * - Helps new developers understand the data flow and transformation
 *
 * @module common/framework/batch/models/transformedData
 */
/**
 * TransformedData model
 * 
 * Represents data that has been transformed from a CRM-specific format
 * to a common format that can be processed by the system
 */

/**
 * Record in the transformed data
 */
export interface TransformedRecord {
  /**
   * External ID from the CRM system
   */
  externalId: string;
  
  /**
   * Name of the entity
   */
  name?: string;
  
  /**
   * Email address
   */
  email?: string;
  
  /**
   * Phone number
   */
  phone?: string;
  
  /**
   * Additional fields
   */
  [key: string]: any;
  
  /**
   * Metadata about the record
   */
  metadata?: Record<string, any>;
}

/**
 * Transformed data interface
 */
export interface TransformedData {
  /**
   * Tenant identifier
   */
  tenantId: string;
  
  /**
   * File identifier
   */
  fileId: string;
  
  /**
   * Type of CRM system
   */
  crmType: string;
  
  /**
   * Timestamp when the data was transformed
   */
  timestamp: string;
  
  /**
   * Transformed records
   */
  records: TransformedRecord[];
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}
