/**
 * ErrorStore.ts - Error Storage Interface for Batch Processing
 *
 * This file defines the ErrorStore interface for tracking and managing errors during batch processing.
 * It provides a contract for storing, retrieving, and handling error records for batch repositories.
 *
 * What does this file do?
 * - Defines ErrorStore interface for error tracking
 * - Standardizes error management for batch repositories
 *
 * How do you use it?
 * - Implement ErrorStore to customize error storage (memory, DB, etc.)
 * - Use in batch repositories to record and retrieve errors
 *
 * Why is this important?
 * - Ensures consistent error handling and reporting
 * - Helps new developers understand error management in the batch framework
 *
 * @module common/framework/batch/services/ErrorStore
 */
import { logger } from '@platform/core';

/**
 * Interface for error storage during batch processing
 */
export interface ErrorStore {
  /**
   * Add an error record
   * @param fileId Unique identifier for the file
   * @param record The record that failed processing
   * @param error Error message
   * @param retryable Whether the error is retryable
   */
  addError(fileId: string, record: any, error: string, retryable: boolean): void;
  
  /**
   * Get all errors for a file
   * @param fileId Unique identifier for the file
   * @returns Array of error records with details
   */
  getErrors(fileId: string): Array<{record: any, error: string, retryable: boolean}>;
  
  /**
   * Get error count for a file
   * @param fileId Unique identifier for the file
   * @returns Number of errors
   */
  getErrorCount(fileId: string): number;
  
  /**
   * Get retryable error count for a file
   * @param fileId Unique identifier for the file
   * @returns Number of retryable errors
   */
  getRetryableErrorCount(fileId: string): number;
  
  /**
   * Check if a file has any errors
   * @param fileId Unique identifier for the file
   * @returns True if the file has errors
   */
  hasErrors(fileId: string): boolean;
  
  /**
   * Clear errors for a file
   * @param fileId Unique identifier for the file
   */
  clear(fileId: string): void;
}

/**
 * In-memory implementation of ErrorStore
 */
export class InMemoryErrorStore implements ErrorStore {
  private errors: Map<string, Array<{record: any, error: string, retryable: boolean}>> = new Map();
  private readonly log = logger;
  
  /**
   * Add an error to the store
   * @param fileId Unique identifier for the file
   * @param record The record that failed processing
   * @param error Error message
   * @param retryable Whether the error is retryable
   */
  addError(fileId: string, record: any, error: string, retryable: boolean): void {
    if (!this.errors.has(fileId)) {
      this.errors.set(fileId, []);
    }
    // Get the errors array, which we know exists because we just initialized it if needed
    const fileErrors = this.errors.get(fileId)!;
    fileErrors.push({ record, error, retryable });
  }
  
  /**
   * Get all errors for a file
   * @param fileId Unique identifier for the file
   * @returns Array of error records with details
   */
  getErrors(fileId: string): Array<{record: any, error: string, retryable: boolean}> {
    return this.errors.get(fileId) || [];
  }
  
  /**
   * Get the total number of errors for a file
   * @param fileId Unique identifier for the file
   * @returns Number of errors
   */
  getErrorCount(fileId: string): number {
    return this.errors.has(fileId) ? this.errors.get(fileId)!.length : 0;
  }
  
  /**
   * Get the number of retryable errors for a file
   * @param fileId Unique identifier for the file
   * @returns Number of retryable errors
   */
  getRetryableErrorCount(fileId: string): number {
    if (!this.errors.has(fileId)) {
      return 0;
    }
    return this.errors.get(fileId)!.filter(e => e.retryable).length;
  }
  
  /**
   * Check if a file has any errors
   * @param fileId Unique identifier for the file
   * @returns True if the file has errors
   */
  hasErrors(fileId: string): boolean {
    return this.errors.has(fileId) && this.errors.get(fileId)!.length > 0;
  }
  
  /**
   * Clear errors for a file
   * @param fileId Unique identifier for the file
   */
  clear(fileId: string): void {
    this.errors.delete(fileId);
    this.log.debug({ fileId }, 'Cleared errors for file');
  }
}
