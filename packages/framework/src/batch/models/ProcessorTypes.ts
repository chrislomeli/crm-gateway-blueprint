/**
 * ProcessorTypes.ts - Types for Batch Processing Results
 *
 * This file defines the core types and interfaces used for processing batches of records in the framework.
 * These types help standardize how results, errors, and processing summaries are represented and shared.
 *
 * What does this file do?
 * - Defines ProcessorResult and related interfaces
 * - Structures how batch processing outcomes are tracked
 *
 * How do you use it?
 * - Use these types to type your batch processor results
 * - Extend interfaces as needed for new result details
 *
 * Why is this important?
 * - Ensures consistent handling of batch processing results and errors
 * - Helps new developers understand the structure of processing outcomes
 *
 * @module common/framework/batch/models/ProcessorTypes
 */
/**
 * Result of processing a batch of records
 * Includes information about successful and failed records
 */
export interface ProcessorResult<T> {
  /**
   * Number of records successfully processed
   */
  processedRecords: number;
  
  /**
   * Records that failed processing
   */
  failedRecords: T[];
  
  /**
   * Detailed error information for failed records
   */
  errors: Array<{
    /**
     * The record that failed
     */
    record: T;
    
    /**
     * Error message
     */
    error: string;
    
    /**
     * Whether the error is retryable
     * True if the error is due to a transient issue that might succeed on retry
     * False if the error is permanent and would fail again with the same input
     */
    retryable: boolean;
  }>;
}

/**
 * Batch processor function type
 * Processes a batch of records and returns detailed results
 */
export type BatchProcessor<T> = (records: T[]) => Promise<ProcessorResult<T>>;



/**
 * Processing result for a file
 */
export interface FileProcessingResult {
  /**
   * File ID
   */
  fileId: number;
  
  /**
   * File path
   */
  filePath: string;
  
  /**
   * Number of records successfully processed
   */
  recordsProcessed: number;
  
  /**
   * Number of records that failed processing
   */
  recordsFailed: number;
  
  /**
   * Number of retryable errors
   */
  retryableErrors?: number;
  
  /**
   * Number of non-retryable errors
   */
  nonRetryableErrors?: number;
  
  /**
   * Whether the file was processed successfully
   */
  success: boolean;
  
  /**
   * Whether the file was partially processed successfully
   */
  partialSuccess?: boolean;
  
  /**
   * Error message if processing failed
   */
  errorMessage?: string;
  
  /**
   * Path to the error file if any
   */
  errorFilePath?: string;
}
