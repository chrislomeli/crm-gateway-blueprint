/**
 * TrackedJsonLinesBatchReader.ts - JSON Lines Batch Reader with Tracking
 *
 * This file implements a batch reader for JSON Lines files with tracking support. It integrates with the batch framework
 * to track progress, handle chunking, and manage file status updates during processing.
 *
 * What does this file do?
 * - Reads and parses JSON Lines files in batches
 * - Tracks file progress and status in the batch system
 * - Supports chunking and progress reporting
 *
 * How do you use it?
 * - Configure and instantiate TrackedJsonLinesBatchReader in your batch job
 * - Use its methods to process JSON Lines files with tracking
 *
 * Why is this important?
 * - Enables reliable and observable JSON Lines processing in batch repositories
 * - Helps new developers understand file tracking and chunking
 *
 * @module common/framework/batch/plugins/reader/TrackedJsonLinesBatchReader
 */
import { Transform, TransformCallback, Readable } from 'stream';
import { createInterface } from 'readline';
import { logger } from '@platform/core';
import { BatchFileTrackingService, BatchFileStatus } from '../../services';
import { StringOffset } from '../../models';

/**
 * Configuration for TrackedJsonLinesBatchReader
 */
export interface TrackedJsonLinesBatchReaderConfig {
  fileId: number;
  businessId: string;
  filePath: string;
  batchService: BatchFileTrackingService;
  chunkSize?: number;
}

/**
 * A chunk of JSON Lines records with tracking information
 */
export interface JsonLinesBatchChunk {
  records: any[];
  offset: StringOffset;
  chunkIdentifier: string;
}

/**
 * A JSON Lines batch reader that tracks processing progress in the database
 * Extends Transform stream to process JSON Lines files in chunks
 * Handles .jsonl, .ndjson, and .json files with one JSON object per line
 */
export class TrackedJsonLinesBatchReader extends Transform {
  private readonly chunkSize: number;
  private readonly fileId: number;
  private readonly fileInfo: TrackedJsonLinesBatchReaderConfig;
  private readonly businessId: string;
  private readonly filePath: string;
  private readonly batchService: BatchFileTrackingService;
  private buffer: any[] = [];
  private lineCount: number = 0;
  private offset: StringOffset = new StringOffset('0');
  private readonly log = logger;
  private lineReader: any;

  /**
   * Creates a new TrackedJsonLinesBatchReader
   * @param config Reader configuration
   */
  constructor(private config: TrackedJsonLinesBatchReaderConfig) {
    super({ objectMode: true });
    
    this.fileId = config.fileId;
    this.fileInfo = config;
    this.businessId = config.businessId;
    this.filePath = config.filePath;
    this.batchService = config.batchService;
    this.chunkSize = config.chunkSize || 1000;
  }

  /**
   * Transform stream _transform implementation
   */
  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    // If this is the first chunk, set up the line reader
    if (!this.lineReader) {
      // Create a readable stream from the input
      const readable = this.createReadableFromChunk(chunk);
      
      // Create a readline interface
      this.lineReader = createInterface({
        input: readable,
        crlfDelay: Infinity
      });
      
      // Set up line reader event handlers
      this.lineReader.on('line', this.onLine.bind(this));
      this.lineReader.on('close', () => {
        if (this.buffer.length > 0) {
          this.emitChunk();
        }
      });
    } else {
      // Feed the chunk to the line reader
      this.lineReader.write(chunk);
    }
    
    callback();
  }

  /**
   * Transform stream _flush implementation
   */
  _flush(callback: TransformCallback): void {
    // End the line reader and flush any remaining records
    if (this.lineReader) {
      this.lineReader.close();
    }
    
    // If there are any records in the buffer, emit them as a final chunk
    if (this.buffer.length > 0) {
      this.emitChunk();
    }
    
    callback();
  }

  /**
   * Handle line event from the line reader
   */
  private onLine(line: string): void {
    // Skip empty lines
    if (!line.trim()) {
      return;
    }
    
    try {
      // Parse the JSON line
      const record = JSON.parse(line);
      
      // Add record to buffer
      this.buffer.push(record);
      this.lineCount++;
      
      // If buffer reaches chunk size, emit the chunk
      if (this.buffer.length >= this.chunkSize) {
        this.emitChunk();
      }
    } catch (error) {
      this.log.error({ 
        error, 
        fileId: this.fileId, 
        line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
        lineNumber: this.lineCount + 1
      }, 'Error parsing JSON line');
      
      // Continue processing other lines
    }
  }

  /**
   * Emit a chunk of records
   */
  private emitChunk(): void {
    if (this.buffer.length === 0) return;
    
    // Create a chunk identifier based on the file ID and offset
    const chunkIdentifier = `${this.fileId}-${this.offset.toString()}`;
    
    // Create the chunk
    const chunk: JsonLinesBatchChunk = {
      records: this.buffer,
      offset: this.offset,
      chunkIdentifier
    };
    
    // Update the offset
    this.offset = new StringOffset((this.lineCount).toString());
    
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

  /**
   * Create a readable stream from a chunk
   * @param chunk The chunk to convert to a readable stream
   */
  private createReadableFromChunk(chunk: any): NodeJS.ReadableStream {
    const readable = new Readable();
    readable._read = () => {}; // Required implementation
    readable.push(chunk);
    readable.push(null);
    return readable;
  }
}
