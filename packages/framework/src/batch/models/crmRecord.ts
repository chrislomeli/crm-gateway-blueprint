/**
 * crmRecord.ts - Common CRM Record Interface
 *
 * This file defines the base interface for CRM records to standardize common fields
 * across different CRM systems and processing patterns.
 *
 * What does this file do?
 * - Defines a common base interface for all CRM record types
 * - Standardizes core fields that most CRM systems share
 * - Allows for type-safe extensions by specific CRM adapters
 *
 * How do you use it?
 * - Extend this interface for CRM-specific record types
 * - Use as a base type for functions that work with multiple CRM types
 *
 * Why is this important?
 * - Provides consistency across different CRM record formats
 * - Enables shared functionality while allowing CRM-specific extensions
 * - Improves type safety and code reusability
 *
 * @module common/framework/batch/models/crmRecord
 */

/**
 * Base interface for CRM records
 * Contains common fields that most CRM systems provide
 */
export interface CrmRecord {
  /**
   * Unique identifier for the record (could be external ID, email, etc.)
   */
  id: string;

  /**
   * Email address
   */
  email?: string;

  /**
   * First name
   */
  firstname?: string;

  /**
   * Last name
   */
  lastname?: string;

  /**
   * Phone number
   */
  phone?: string;

  /**
   * Company or organization name
   */
  company?: string;

  /**
   * Allow additional fields for CRM-specific extensions
   */
  [key: string]: any;
}

/**
 * Extended CRM record with processing metadata
 * Useful for records that need tracking information
 */
export interface CrmRecordWithMetadata extends CrmRecord {
  /**
   * Processing metadata
   */
  metadata?: {
    /**
     * Source CRM system
     */
    source?: string;

    /**
     * Processing timestamp
     */
    timestamp?: string;

    /**
     * Original record data before transformation
     */
    originalData?: any;

    /**
     * Additional metadata fields
     */
    [key: string]: any;
  };
}