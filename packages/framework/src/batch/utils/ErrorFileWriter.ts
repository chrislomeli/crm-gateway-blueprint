/**
 * ErrorFileWriter.ts - Error File Writer Utility
 *
 * This file defines the ErrorFileWriter class for writing error records to files and uploading them to S3.
 * It provides methods for formatting, saving, and managing error files in the batch processing framework.
 *
 * What does this file do?
 * - Writes error records to local or S3 files
 * - Formats errors as CSV for review and debugging
 *
 * How do you use it?
 * - Instantiate ErrorFileWriter with an S3 service
 * - Use its methods to write and upload error files in batch repositories
 *
 * Why is this important?
 * - Enables error review and troubleshooting for failed records
 * - Helps new developers understand error reporting and S3 integration
 *
 * @module common/framework/batch/utils/ErrorFileWriter
 */
import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'csv-stringify/sync';
import { logger } from '@platform/core';
import { S3Service } from '@platform/services';

/**
 * Utility for writing error files
 */
export class ErrorFileWriter {
  private readonly log = logger;
  
  /**
   * Creates a new ErrorFileWriter
   * @param s3Service S3 service for uploading error files
   */
  constructor(private readonly s3Service: S3Service) {}
  
  /**
   * Write errors to a file
   * @param errorFilePath Path to write the error file
   * @param errors Array of error records
   * @param fileType Type of file to write ('csv' or 'json')
   * @returns Path to the written error file
   */
  async writeErrorFile<T>(
    errorFilePath: string,
    errors: Array<{record: T, error: string, retryable: boolean}>,
    fileType: 'csv' | 'json'
  ): Promise<string> {
    this.log.info( { errorFilePath, errorCount: errors.length }, 'Writing error file' );
    
    // Create temporary file path
    const tempDir = '/tmp';
    const tempFilePath = path.join(tempDir, path.basename(errorFilePath));
    
    try {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Write to temp file based on file type
      if (fileType === 'csv') {
        await this.writeErrorCsvFile(tempFilePath, errors);
      } else {
        await this.writeErrorJsonLinesFile(tempFilePath, errors);
      }
      
      // Upload to S3 if path starts with s3://
      if (errorFilePath.startsWith('s3://')) {
        const s3Path = errorFilePath.substring(5); // Remove s3:// prefix
        const [bucket, ...keyParts] = s3Path.split('/');
        const key = keyParts.join('/')
        
        await S3Service.uploadFile(tempFilePath, bucket, key);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        
        return errorFilePath;
      } else {
        // Ensure directory exists for local file
        const dir = path.dirname(errorFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Move temp file to final location
        fs.renameSync(tempFilePath, errorFilePath);
        
        return errorFilePath;
      }
    } catch (error) {
      this.log.error({ error, errorFilePath }, 'Failed to write error file');
      throw error;
    }
  }
  
  /**
   * Write errors to a CSV file
   * @param filePath Path to write the CSV file
   * @param errors Array of error records
   */
  private async writeErrorCsvFile<T>(
    filePath: string,
    errors: Array<{record: T, error: string, retryable: boolean}>
  ): Promise<void> {
    // Prepare data for CSV
    const rows = errors.map(({ record, error, retryable }) => {
      // Convert record to flat object
      const flatRecord = this.flattenRecord(record);
      
      // Add error columns
      return {
        ...flatRecord,
        _error_message: error,
        _retryable: retryable ? 'Yes' : 'No'
      };
    });
    
    // Get all unique headers
    const headers = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => headers.add(key));
    });
    
    // Ensure error columns are at the end
    const sortedHeaders = [...headers].sort((a, b) => {
      if (a.startsWith('_') && !b.startsWith('_')) return 1;
      if (!a.startsWith('_') && b.startsWith('_')) return -1;
      return a.localeCompare(b);
    });
    
    // Generate CSV
    const csv = stringify(rows, {
      header: true,
      columns: sortedHeaders
    });
    
    // Write to file
    await fs.promises.writeFile(filePath, csv);
  }
  
  /**
   * Write errors to a JSON Lines file
   * @param filePath Path to write the JSON Lines file
   * @param errors Array of error records
   */
  private async writeErrorJsonLinesFile<T>(
    filePath: string,
    errors: Array<{record: T, error: string, retryable: boolean}>
  ): Promise<void> {
    // Convert errors to JSON Lines format
    const lines = errors.map(({ record, error, retryable }) => {
      return JSON.stringify({
        ...record,
        _error_message: error,
        _retryable: retryable
      });
    }).join('\n');
    
    // Write to file
    await fs.promises.writeFile(filePath, lines);
  }
  
  /**
   * Flatten a nested record for CSV output
   * @param record Record to flatten
   * @returns Flattened record
   */
  private flattenRecord(record: any): Record<string, any> {
    const result: Record<string, any> = {};
    
    const flatten = (obj: any, prefix = '') => {
      if (obj === null || obj === undefined) {
        return;
      }
      
      if (typeof obj === 'object' && !Array.isArray(obj)) {
        Object.entries(obj).forEach(([key, value]) => {
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          flatten(value, newPrefix);
        });
      } else {
        result[prefix] = obj;
      }
    };
    
    flatten(record);
    return result;
  }
}
