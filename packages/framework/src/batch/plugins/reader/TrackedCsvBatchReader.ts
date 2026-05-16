/**
 * TrackedCsvBatchReader.ts - CSV Batch Reader with Tracking
 *
 * This file implements a batch reader for CSV files with tracking support. It integrates with the batch framework
 * to track progress, handle chunking, and manage file status updates during processing.
 *
 * What does this file do?
 * - Reads and parses CSV files in batches
 * - Tracks file progress and status in the batch system
 * - Supports chunking, delimiters, and header row detection
 *
 * How do you use it?
 * - Configure and instantiate TrackedCsvBatchReader in your batch job
 * - Use its methods to process CSV files with tracking
 *
 * Why is this important?
 * - Enables reliable and observable CSV processing in batch repositories
 * - Helps new developers understand file tracking and chunking
 *
 * @module common/framework/batch/plugins/reader/TrackedCsvBatchReader
 */
import { Transform, TransformCallback } from 'stream';
import { parse } from 'csv-parse';
import { logger } from '@platform/core';
import { BatchFileTrackingService, BatchFileStatus } from '../../services';
import { StringOffset } from '../../models';


/**
 * Configuration for TrackedCsvBatchReader
 */
export interface TrackedCsvBatchReaderConfig {
  fileId: number;
  businessId: string;
  filePath: string;
  batchService: BatchFileTrackingService;
  chunkSize?: number;
  delimiter?: string;
  hasHeaderRow?: boolean;
  columns?: boolean | string[];
  comment?: string;
  escape?: string;
  quote?: string;
}

/**
 * A chunk of CSV records with tracking information
 */
export interface CsvBatchChunk {
  records: any[];
  offset: StringOffset;
  chunkIdentifier: string;
}

/**
 * A CSV batch reader that tracks processing progress in the database
 * Extends Transform stream to process CSV files in chunks
 */
export class TrackedCsvBatchReader extends Transform {
  private readonly parser: any;
  private readonly chunkSize: number;
  private readonly fileId: number;
  private readonly fileInfo: TrackedCsvBatchReaderConfig;
  private readonly businessId: string;
  private readonly filePath: string;
  private readonly batchService: BatchFileTrackingService;
  private buffer: any[] = [];
  private headerRow: string[] = [];
  private hasHeaderRow: boolean;
  private rowCount: number = 0;
  private offset: StringOffset = new StringOffset('0');
  private readonly log = logger;

  /**
   * Creates a new TrackedCsvBatchReader
   * @param config Reader configuration
   */
  constructor(private config: TrackedCsvBatchReaderConfig) {
    super({ objectMode: true });
    
    this.fileId = config.fileId;
    this.fileInfo = config;
    this.businessId = config.businessId;
    this.filePath = config.filePath;
    this.batchService = config.batchService;
    this.chunkSize = config.chunkSize || 1000;
    this.hasHeaderRow = config.hasHeaderRow !== false;
    
    // Create the CSV parser
    this.parser = parse({
      delimiter: config.delimiter || ',',
      columns: config.columns === undefined ? this.hasHeaderRow : config.columns,
      comment: config.comment,
      escape: config.escape,
      quote: config.quote,
      skip_empty_lines: true
    });
    
    // Set up parser event handlers
    this.parser.on('readable', this.onReadable.bind(this));
    this.parser.on('error', this.onError.bind(this));
    this.parser.on('end', this.onEnd.bind(this));
  }

  /**
   * Transform stream _transform implementation
   */
  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    // Feed the chunk to the parser
    this.parser.write(chunk);
    callback();
  }

  /**
   * Transform stream _flush implementation
   */
  _flush(callback: TransformCallback): void {
    this.log.info({ 
      fileId: this.fileId, 
      bufferLength: this.buffer.length,
      totalRowCount: this.rowCount 
    }, 'TrackedCsvBatchReader._flush called');
    
    // End the parser and flush any remaining records
    this.parser.end();
    
    // If there are any records in the buffer, emit them as a final chunk
    if (this.buffer.length > 0) {
      this.log.info({
        fileId: this.fileId,
        recordsToFlush: this.buffer.length,
        allRecordIds: this.buffer.map(r => r['Record ID'] || 'no-id')
      }, 'Emitting final chunk in _flush');
      this.emitChunk();
    }
    
    callback();
  }

  /**
   * Handle readable event from the parser
   */
  private onReadable(): void {
    let record;
    while ((record = this.parser.read()) !== null) {
      // When columns: true is set, csv-parse handles the header automatically
      // and returns objects, not arrays. No need to skip any rows.
      
      // Add record to buffer
      this.buffer.push(record);
      this.rowCount++;
      
      // Use info level to ensure visibility
      this.log.info({ 
        fileId: this.fileId,
        rowCount: this.rowCount,
        bufferLength: this.buffer.length,
        recordId: record['Record ID'] || record['id'] || 'no-id',
        recordEmail: record['Email'] || record['email'] || 'no-email',
        recordSample: Object.keys(record).slice(0, 5)
      }, 'Added record to buffer');
      
      // If buffer reaches chunk size, emit the chunk
      if (this.buffer.length >= this.chunkSize) {
        this.emitChunk();
      }
    }
  }

  /**
   * Handle error event from the parser
   */
  private onError(err: Error): void {
    this.log.error({ error: err, fileId: this.fileId }, 'Error parsing CSV');
    this.emit('error', err);
  }

  /**
   * Handle end event from the parser
   */
  private onEnd(): void {
    this.log.info({ 
      fileId: this.fileId, 
      rowCount: this.rowCount, 
      bufferLength: this.buffer.length,
      hasHeaderRow: this.hasHeaderRow
    }, 'CSV parsing completed');
    this.push(null);
  }

  /**
   * Emit a chunk of records
   */
  private emitChunk(): void {
    if (this.buffer.length === 0) return;
    
    // Create a chunk identifier based on the file ID and offset
    const chunkIdentifier = `${this.fileId}-${this.offset.toString()}`;
    
    this.log.info({ 
      fileId: this.fileId,
      chunkIdentifier,
      recordCount: this.buffer.length,
      allRecordIds: this.buffer.map(r => r['Record ID'] || 'no-id'),
      firstRecordSample: this.buffer[0] ? Object.keys(this.buffer[0]).slice(0, 5) : []
    }, 'Emitting chunk of records');
    
    // Create the chunk
    const chunk: CsvBatchChunk = {
      records: this.buffer,
      offset: this.offset,
      chunkIdentifier
    };
    
    // Update the offset
    this.offset = new StringOffset((this.rowCount).toString());
    
    // Record the chunk in the database
    this.recordChunkProcessing(chunkIdentifier, this.buffer.length)
      .catch(err => {
        this.log.error({ error: err, fileId: this.fileId, chunkIdentifier }, 'Failed to record chunk processing');
      });
    
    // Push the chunk downstream
    this.push(chunk);
    
    // Clear the buffer
    this.buffer = [];
  }

  /**
   * Records chunk processing information
   * @param chunkIdentifier Unique identifier for the chunk
   * @param recordCount Number of records in the chunk
   */
  private async recordChunkProcessing(chunkIdentifier: string, recordCount: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Record the chunk processing
      await this.batchService.addProcessingHistory({
        fileId: this.fileId,
        chunkIdentifier,
        recordsProcessed: recordCount,
        processingTimeMs: 0 // Processing time will be updated later
      });
      
      // Update file progress
      await this.batchService.updateFileStatusByPath(
        this.businessId,
        this.filePath,
        {
          status: BatchFileStatus.PROCESSING,
          processedRecords: recordCount,
          lastChunk: this.offset.toString()
        }
      );


      // Calculate processing time
      const processingTime = Date.now() - startTime;
      
      // Update processing time
      await this.batchService.updateProcessingHistory({
        fileId: this.fileId,
        chunkIdentifier,
        processingTimeMs: processingTime
      });
    } catch (error) {
      this.log.error({ 
        error, 
        fileId: this.fileId, 
        chunkIdentifier, 
        recordCount 
      }, 'Failed to record chunk processing');
    }
  }
}
