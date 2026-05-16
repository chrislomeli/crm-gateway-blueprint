/**
 * FileProcessorService.ts - File Processor Service for Batch Jobs
 *
 * This file defines the FileProcessorService class and related types for processing batch files.
 * It manages file reading, chunking, error handling, and integration with tracking and storage services.
 *
 * What does this file do?
 * - Orchestrates reading and processing of batch files
 * - Handles chunking, error writing, and progress tracking
 * - Integrates with S3, local FS, and tracking services
 *
 * How do you use it?
 * - Instantiate and use FileProcessorService in your batch job
 * - Extend or customize for new file formats or error handling needs
 *
 * Why is this important?
 * - Centralizes file processing logic for maintainability
 * - Helps new developers understand the file processing workflow
 *
 * @module common/framework/batch/services/FileProcessorService
 */
import {createError, failure, logger, Result, success} from '@platform/core';
import {BatchFileStatus, BatchFileTrackingService, FileInfo} from './BatchFileTrackingService';
import {S3Service} from '@platform/services';
import * as path from 'path';
import fs, {createReadStream} from 'fs';
import {pipeline} from 'stream/promises';
import {TrackedCsvBatchReader, TrackedJsonLinesBatchReader} from '../../plugins';
import {CONFIG, ConfigProvider} from '@platform/configuration';
import {Readable, Transform} from 'stream';
import {ErrorStore, InMemoryErrorStore} from './ErrorStore';
import {BatchProcessor, FileProcessingResult, ProcessorResult} from '../../models';
import {ErrorFileWriter} from "../../utils";


/**
 * File processor configuration
 */
export interface FileProcessorConfig {
  s3Bucket?: string;
  s3Prefix?: string;
  tempDir?: string;
  chunkSize?: number;
  errorStore?: ErrorStore;
  systemUnavailabilityThreshold?: number; // Percentage of retryable errors that indicates system unavailability
}

/**
 * Represents a chunk of records with tracking information
 */
export interface TrackedChunk<T = any> {
  /**
   * Unique identifier for the chunk
   */
  chunkIdentifier: string;
  
  /**
   * Records in the chunk
   */
  records: T[];
  
  /**
   * Metadata about the chunk
   */
  metadata?: Record<string, any>;
}

/**
 * Common interface for batch chunks
 */
export interface BatchChunk<T> {
  records: T[];
  offset: any;
  chunkIdentifier: string;
}

/**
 * Common interface for tracked batch readers
 * Represents the shared functionality between different format readers
 */
export interface TrackedBatchReader<T = any> extends Transform {
  // The Transform stream will push chunks of type TrackedChunk<T>
}

/**
 * Service for processing batch files
 * Handles file downloading, processing, and tracking
 */
export class FileProcessorService {
  private readonly s3Bucket: string;
  private readonly s3Prefix: string;
  private readonly tempDir: string;
  private readonly chunkSize: number;
  private readonly errorStore: ErrorStore;
  private readonly errorFileWriter: ErrorFileWriter;
  private readonly systemUnavailabilityThreshold: number;

  /**
   * Creates a new FileProcessorService
   * @param batchService The batch file tracking service
   * @param s3Service The S3 service (not used directly, using static methods instead)
   * @param config File processor configuration
   */
  constructor(
    private readonly batchService: BatchFileTrackingService,
    private readonly s3Service: S3Service,
    config?: FileProcessorConfig
  ) {
    this.s3Bucket = config?.s3Bucket || ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_BUCKET, 'crmdata');
    this.s3Prefix = config?.s3Prefix || ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_PREFIX, 'exports');
    this.tempDir = config?.tempDir || ConfigProvider.getRaw('tempDir', '/tmp');
    this.chunkSize = config?.chunkSize || ConfigProvider.getRaw('chunkSize', 1000);
    this.errorStore = config?.errorStore || new InMemoryErrorStore();
    this.errorFileWriter = new ErrorFileWriter(s3Service);
    this.systemUnavailabilityThreshold = config?.systemUnavailabilityThreshold || 80; // Default 80%
  }

  /**
   * Process a file and return the result
   * @param file The file to process
   * @param businessId The business ID of the tenant
   * @param processor Optional processor to use for processing records
   * @returns The processing result
   */
  async processFile(file: FileInfo, businessId: string, processor?: BatchProcessor<any>): Promise<Result<FileProcessingResult>> {
    try {
      // Register the file for processing if not already registered
      let fileId: number;
      try {
        const filePathHash = this.batchService.generateFilePathHash(file.filePath);
        const existingFile = await this.batchService.selectBatchFilesRecord(file.businessId, file.filePath);
        if (existingFile) {
          fileId = existingFile.id;
        } else {
          // Generate a hash of the file path for tracking
          const newFileId = await this.batchService.registerFile(file, filePathHash);
          if (!newFileId) {
            return failure(createError({
              message: `Failed to register file: ${file.filePath}`,
              type: 'RegistrationError'
            }));
          }
          fileId = newFileId;
        }
      } catch (error) {
        return failure(createError({
          message: `Failed to register file: ${file.filePath}`,
          type: 'RegistrationError',
          cause: error
        }));
      }
      
      // Update file status to PROCESSING
      await this.batchService.updateFileStatus(fileId, BatchFileStatus.PROCESSING);
      
      // Clear any previous errors for this file
      this.errorStore.clear(fileId.toString());
      
      // Determine the file type and process accordingly
      let recordsProcessed = 0;
      
      if (file.filePath.toLowerCase().endsWith('.csv')) {
        // Process as CSV
        recordsProcessed = await this.processCsvFile(file, businessId, fileId, processor);
      } else if (file.filePath.toLowerCase().endsWith('.jsonl') || file.filePath.toLowerCase().endsWith('.ndjson')) {
        // Process as JSON Lines
        recordsProcessed = await this.processJsonLinesFile(file, businessId, fileId, processor);
      } else {
        // Unsupported file type
        await this.batchService.updateFileStatus(fileId, BatchFileStatus.FAILED);
        return failure(createError({
          message: `Unsupported file type: ${path.extname(file.filePath)}`,
          type: 'UnsupportedFileType'
        }));
      }
      
      // Get all errors for this file
      const errors = await this.errorStore.getErrors(fileId.toString());
      const errorCount = errors.length;
      const retryableErrorCount = errors.filter(e => e.retryable).length;
      const nonRetryableErrorCount = errorCount - retryableErrorCount;
      const successfulRecords = recordsProcessed - errorCount;
      
      // Determine file status
      let status: BatchFileStatus;
      let isASuccess: boolean;
      let partialSuccess: boolean = false;
      let errorMessage: string | undefined;
      
      if (recordsProcessed === 0) {
        // No records processed - either all failed or invalid format
        status = BatchFileStatus.FAILED;
        isASuccess = false;
        errorMessage = errorCount > 0 
          ? `All ${errorCount} records failed processing` 
          : 'No records processed - file may have invalid format';
      } else if (retryableErrorCount >= (this.getChunkSize() * this.systemUnavailabilityThreshold / 100)) {
        // System unavailability detected
        status = BatchFileStatus.SYSTEM_UNAVAILABLE;
        isASuccess = false;
        partialSuccess = true;
        errorMessage = `System unavailability detected: ${retryableErrorCount} retryable errors`;
      } else if (errorCount > 0) {
        // Some records failed
        status = BatchFileStatus.PARTIAL_SUCCESS;
        isASuccess = true;
        partialSuccess = true;
      } else {
        // All records succeeded
        status = BatchFileStatus.SUCCESS;
        isASuccess = true;
      }
      
      // Update file status
      await this.batchService.updateFileStatus(fileId, status, {
        totalRecords: recordsProcessed,
        processedRecords: recordsProcessed,
        successfulRecords: successfulRecords,
        recordsFailed: errorCount,
        retryableErrors: retryableErrorCount,
        nonRetryableErrors: nonRetryableErrorCount
      });
      
      // Generate error file if there are errors
      let errorFilePath: string | undefined;
      if (errorCount > 0) {
        errorFilePath = await this.errorFileWriter.writeErrorFile(
          fileId.toString(),
          errors,
          file.filePath.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
        );
      }
      
      // Return success result
      return success({
        fileId,
        filePath: file.filePath,
        recordsProcessed,
        successfulRecords,
        success: isASuccess,
        partialSuccess,
        errorMessage,
        recordsFailed: errorCount,
        retryableErrors: retryableErrorCount,
        nonRetryableErrors: nonRetryableErrorCount,
        errorFilePath
      } as FileProcessingResult);
    } catch (error) {
      // Get file ID if possible
      let fileId: number | null = null;
      try {
        const existingFile = await this.batchService.selectBatchFilesRecord(file.businessId, file.filePath);
        if (existingFile) {
          fileId = existingFile.id;
        }
      } catch (e) {
        // Ignore errors when trying to get file ID
      }
      
      // Update file status to failed if we have a file ID
      if (fileId) {
        await this.batchService.updateFileStatus(fileId, BatchFileStatus.FAILED);
        
        // Clear any errors from store
        this.errorStore.clear(fileId.toString());
      }
      
      // Log error
      logger.error({ error, filePath: file.filePath }, 'Error processing file');
      
      // Return failure result
      return failure(createError({
        message: `Error processing file: ${file.filePath}`,
        type: 'ProcessingError',
        cause: error
      }));
    }
  }

  /**
   * Process a file with a specific reader and processor
   * @param file The file to process
   * @param businessId The business ID of the tenant
   * @param fileId The file ID
   * @param createReader Function to create the appropriate reader
   * @param processor Function to process records
   * @returns The number of records processed
   */
  private async processFileWithReader<T>(
    file: FileInfo,
    businessId: string,
    fileId: number,
    createReader: () => TrackedBatchReader<T>,
    processor: BatchProcessor<T>
  ): Promise<number> {
    logger.info({ fileId, filePath: file.filePath }, 'Processing file with reader');
    
    // Download the file to a temporary location if it's in S3
    const localFilePath = await this.downloadFileIfNeeded(file.filePath);
    
    try {
      // Create the reader using the provided factory function
      const reader = createReader();
      
      // Get the read stream for the file
      let readStream: Readable;
      if (file.filePath.startsWith('s3://')) {
        const bucket = file.filePath.split('/')[2];
        const key = file.filePath.split('/').slice(3).join('/');
        const streamResult = await S3Service.getObjectStream(bucket, key);
        if (streamResult.success === false) {
          throw new Error(`Failed to get S3 stream: ${streamResult.error.message}`);
        }
        readStream = streamResult.data;
      } else {
        readStream = createReadStream(localFilePath);
      }
      
      // Set up variables to track processing
      let totalProcessed = 0;
      let systemUnavailable = false;
      
      // Create a reference to this for use in the generator function
      const self = this;
      
      // Process the file using the pipeline
      await pipeline(
        readStream,
        reader,
        async function* (source: AsyncIterable<TrackedChunk<T>>) {
          for await (const chunk of source) {
            try {
              // Process the chunk using the enhanced processor
              const result = await self.processChunk(chunk, processor, fileId);
              
              // Update total processed count
              totalProcessed += result.processedRecords;
              
              // Check if we should stop processing due to system unavailability
              if (self.isSystemUnavailable(chunk, result)) {
                systemUnavailable = true;
                logger.warn(
                  { fileId, chunkId: chunk.chunkIdentifier, retryableErrors: result.errors.filter(e => e.retryable).length },
                  'System unavailability detected, stopping processing'
                );
                break; // Stop processing more chunks
              }
              yield chunk;
            } catch (error) {
              // Log chunk-level error
              logger.error({ error, fileId, chunkId: chunk.chunkIdentifier }, 'Chunk processing failed');
              
              // Add all records from this chunk to errors as retryable
              chunk.records.forEach(record => {
                self.errorStore.addError(
                  fileId.toString(),
                  record,
                  error instanceof Error ? error.message : String(error),
                  true // Assume chunk-level errors are retryable
                );
              });
            }
          }
        }
      );
      
      return totalProcessed;
    } catch (error) {
      // Log error
      logger.error({ error, fileId, filePath: file.filePath }, 'Error in file processing pipeline');
      
      // Re-throw error
      throw error;
    } finally {
      // Clean up the temporary file if we downloaded it
      if (localFilePath !== file.filePath) {
        try {
          // Delete the temporary file
          fs.unlinkSync(localFilePath);
        } catch (error) {
          logger.warn({ error, path: localFilePath }, 'Failed to delete temporary file');
        }
      }
    }
  }

  /**
   * Process a chunk of records
   * @param chunk The chunk to process
   * @param processor The processor function
   * @param fileId The file ID
   * @returns The processing result
   */
  private async processChunk<T>(
    chunk: TrackedChunk<T>,
    processor: BatchProcessor<T>,
    fileId: number
  ): Promise<ProcessorResult<T>> {
    try {
      // Process the chunk
      const result = await processor(chunk.records);
      
      // Store any errors
      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          this.errorStore.addError(
            fileId.toString(),
            error.record,
            error.error,
            error.retryable
          );
        }
      }
      
      return result;
    } catch (error) {
      // Convert any thrown error to a processor result
      return {
        processedRecords: 0,
        failedRecords: chunk.records,
        errors: chunk.records.map(record => ({
          record,
          error: error instanceof Error ? error.message : String(error),
          retryable: true // Assume thrown errors are retryable
        }))
      };
    }
  }

  /**
   * Check if system is unavailable based on retryable error rate
   * @param chunk The chunk being processed
   * @param result The processing result
   * @returns True if system is unavailable
   */
  private isSystemUnavailable<T>(chunk: TrackedChunk<T>, result: ProcessorResult<T>): boolean {
    // If no records, can't determine
    if (chunk.records.length === 0) return false;
    
    // Count retryable errors
    const retryableErrorCount = result.errors.filter(e => e.retryable).length;
    
    // Calculate percentage
    const retryableErrorPercentage = (retryableErrorCount / chunk.records.length) * 100;
    
    // Check against threshold
    return retryableErrorPercentage >= this.systemUnavailabilityThreshold;
  }

  /**
   * Process a CSV file
   * @param file The file to process
   * @param businessId The business ID of the tenant
   * @param fileId The file ID
   * @param customProcessor Optional processor to use for processing records
   * @returns The number of records processed
   */
  private async processCsvFile(file: FileInfo, businessId: string, fileId: number, customProcessor?: BatchProcessor<any>): Promise<number> {
    return this.processFileWithReader(
      file,
      businessId,
      fileId,
      () => new TrackedCsvBatchReader({
        fileId,
        businessId,
        filePath: file.filePath,
        batchService: this.batchService,
        chunkSize: this.getChunkSize(),
        hasHeaderRow: true  // This will automatically set columns: true as well
      }),
      customProcessor || (async (records) => {
        // Example processor implementation
        logger.info({ count: records.length }, 'Processing CSV records');
        
        // In a real implementation, this would process the records
        // For now, we'll just return the count
        return {
          processedRecords: records.length,
          failedRecords: [],
          errors: []
        };
      })
    );
  }

  /**
   * Process a JSON Lines file
   * @param file The file to process
   * @param businessId The business ID of the tenant
   * @param fileId The file ID
   * @param customProcessor Optional processor to use for processing records
   * @returns The number of records processed
   */
  private async processJsonLinesFile(file: FileInfo, businessId: string, fileId: number, customProcessor?: BatchProcessor<any>): Promise<number> {
    return this.processFileWithReader(
      file,
      businessId,
      fileId,
      () => new TrackedJsonLinesBatchReader({
        fileId,
        businessId,
        filePath: file.filePath,
        batchService: this.batchService,
        chunkSize: this.getChunkSize()
      }),
      customProcessor || (async (records) => {
        // Example processor implementation
        logger.info({ count: records.length }, 'Processing JSON Lines records');
        
        // In a real implementation, this would process the records
        // For now, we'll just return the count
        return {
          processedRecords: records.length,
          failedRecords: [],
          errors: []
        };
      })
    );
  }

  /**
   * Download a file from S3 if needed
   * @param filePath The file path (S3 key or local path)
   * @returns The local file path
   */
  private async downloadFileIfNeeded(filePath: string): Promise<string> {
    // Check if the file is in S3
    if (filePath.startsWith('s3://')) {
      logger.info({ filePath }, 'Downloading file from S3');
      
      // Extract bucket and key from S3 URI
      const s3Uri = filePath.substring(5); // Remove s3:// prefix
      const [bucket, ...keyParts] = s3Uri.split('/');
      const key = keyParts.join('/');
      
      // Create temporary file path
      const tempFilePath = path.join(this.tempDir, path.basename(filePath));
      
      // Download the file
      await S3Service.downloadFile(bucket, key, tempFilePath);
      
      return tempFilePath;
    }
    
    // File is local, return the path
    return filePath;
  }

  /**
   * Get the configured chunk size
   * @returns The chunk size
   */
  getChunkSize(): number {
    return this.chunkSize;
  }
}
