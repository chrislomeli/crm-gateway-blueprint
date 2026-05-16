/**
 * batchFile.ts - Batch File Model
 *
 * This file defines the BatchFile class and related types for representing files in the batch processing system.
 * It standardizes how files, their statuses, and metadata are handled throughout the batch framework.
 *
 * What does this file do?
 * - Defines the BatchFile class and FileStatus type
 * - Structures file metadata and lifecycle in batch repositories
 *
 * How do you use it?
 * - Create BatchFile instances to represent files in processing
 * - Use FileStatus to track file progress and outcomes
 *
 * Why is this important?
 * - Ensures consistent handling of files in the batch system
 * - Helps new developers understand file lifecycle and tracking
 *
 * @module common/framework/batch/models/batchFile
 */
/**
 * BatchFile model
 * 
 * Represents a file to be processed by the batch system
 */

// /**
//  * Enhanced file status enum
//  */
// export enum FileStatus {
//   PENDING = 'pending',
//   PROCESSING = 'processing',
//   SUCCESS = 'success',
//   PARTIAL_SUCCESS = 'partial_success',
//   FAILED = 'failed',
//   SYSTEM_UNAVAILABLE = 'system_unavailable'
// }

/**
 * Status of a batch file
 */
export type FileStatus = 
  | 'PENDING'    // File is waiting to be processed
  | 'PROCESSING' // File is currently being processed
  | 'COMPLETED'  // File has been successfully processed
  | 'FAILED'     // File processing failed
  | 'ARCHIVED';  // File has been archived

/**
 * Batch file model
 */
export class BatchFile {
  /**
   * Unique identifier for the file
   */
  id: string;
  
  /**
   * Tenant identifier
   */
  tenantId: string;
  
  /**
   * Type of CRM system
   */
  crmType: string;
  
  /**
   * Path to the file in S3 (s3://bucket/key)
   */
  path: string;
  
  /**
   * Current status of the file
   */
  status: FileStatus;
  
  /**
   * Timestamp when the file was created
   */
  createdAt: string;
  
  /**
   * Timestamp when the file was last updated
   */
  updatedAt: string;
  
  /**
   * Error message if processing failed
   */
  errorMessage?: string;
  
  /**
   * Additional metadata for the file
   */
  metadata?: Record<string, any>;
  
  /**
   * Constructor
   */
  constructor(data: Partial<BatchFile>) {
    this.id = data.id || '';
    this.tenantId = data.tenantId || '';
    this.crmType = data.crmType || '';
    this.path = data.path || '';
    this.status = data.status || 'PENDING';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.errorMessage = data.errorMessage;
    this.metadata = data.metadata || {};
  }
}
