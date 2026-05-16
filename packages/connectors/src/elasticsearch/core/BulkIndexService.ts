/**
 * BulkIndexService - Buffered, Batched Elasticsearch/OpenSearch Writer
 *
 * This service provides efficient, resilient, and observable bulk indexing of documents
 * into Elasticsearch or OpenSearch. It manages batching, flushing, error tracking, and
 * supports integration with both legacy and modern client response formats.
 *
 * Key features:
 * - Buffers and batches documents for high-throughput indexing
 * - Configurable flush size and interval
 * - Tracks success and error counts for each operation
 * - Compatible with both Elasticsearch and OpenSearch
 * - Integrates with Blueprint observability and error handling patterns
 *
 * This service is used by the batch processing framework and other data ingestion pipelines
 * requiring reliable, high-volume document writes to search backends.
 *
 * @module infrastructure/datastores/elasticsearch/BulkIndexService
 */
import { Result, success, failure, createError } from '@platform/core';
import { logger } from '@platform/core';
import { OpenSearchService } from './OpenSearchService';

/**
 * Configuration for the bulk indexer
 */
export interface BulkIndexerConfig {
  index: string;
  flushSize?: number;
  flushInterval?: number;
  refreshPolicy?: 'wait_for' | 'false' | 'true';
  metrics?: any;
}

/**
 * Document to be indexed
 */
export interface IndexDocument {
  id?: string;
  [key: string]: any;
}

/**
 * Result of a bulk indexing operation
 */
export interface BulkIndexResult {
  successCount: number;
  errorCount: number;
  errors?: any[];
  took?: number;
}

/**
 * Service for buffered, batched writes to Elasticsearch/OpenSearch
 * 
 * This version is compatible with older Elasticsearch client response formats
 * (pre-7.x where responses are not nested under a 'body' property)
 */
export class BulkIndexService {
  private buffer: Array<{ id?: string; document: any }> = [];
  private readonly index: string;
  private readonly flushSize: number;
  private readonly flushInterval: number;
  private readonly refreshPolicy: 'wait_for' | 'false' | 'true';
  private timer: NodeJS.Timeout | null = null;
  private metrics: any;
  private isShuttingDown = false;

  /**
   * Creates a new BulkIndexServiceLegacy instance
   * 
   * @param config Bulk indexer configuration
   */
  constructor(config: BulkIndexerConfig) {
    this.index = config.index;
    this.flushSize = config.flushSize || 20;
    this.flushInterval = config.flushInterval || 10000;
    this.refreshPolicy = config.refreshPolicy || 'false';
    this.metrics = config.metrics;
  }

  /**
   * Initialize the bulk indexer
   * 
   * @returns Result indicating success or failure
   */
  public async initialize(): Promise<Result<void>> {
    // Initialize OpenSearch service if not already initialized
    const initResult = await OpenSearchService.initialize();
    if (!initResult.success) {
      return initResult;
    }
    
    // Start the timer for periodic flushing
    this.startTimer();
    
    return success(undefined);
  }

  /**
   * Add a document to the buffer for indexing
   * 
   * @param document Document to index
   * @returns Result indicating success or failure
   */
  public async addDocument(document: IndexDocument): Promise<Result<void>> {
    logger.info({ documentId: document.id, index: this.index }, 'Adding document to bulk index buffer');
    if (this.isShuttingDown) {
      return failure(createError({
        name: 'BulkIndexerError',
        message: 'Bulk indexer is shutting down',
        type: 'OPERATION_REJECTED',
        statusCode: 503
      }));
    }
    
    logger.debug({ documentId: document.id, index: this.index }, 'Adding document to bulk index buffer');
    
    this.buffer.push({
      id: document.id,
      document
    });
    
    if (this.metrics) {
      this.metrics.getMeter('elasticsearch').createCounter('es.documents.queued').add(1, {
        index: this.index
      });
    }
    
    // Flush if buffer reaches threshold
    if (this.buffer.length >= this.flushSize) {
      return this.flush();
    }
    
    return success(undefined);
  }

  /**
   * Flush the buffer of documents to Elasticsearch
   * 
   * @returns Result indicating success or failure
   */
  public async flush(): Promise<Result<void>> {
    if (this.buffer.length === 0) {
      return success(undefined);
    }
    
    logger.info({ bufferLength: this.buffer.length, index: this.index }, 'Flushing bulk index buffer');
    
    // Prepare bulk operations
    const operations = this.buffer.flatMap(item => {
      const indexOp: any = { index: { _index: this.index } };
      if (item.id) {
        indexOp.index._id = item.id;
      }
      return [indexOp, item.document];
    });
    
    // Execute bulk operation
    const bulkResult = await OpenSearchService.bulk(operations, {
      refresh: this.refreshPolicy
    });

    // Clear the buffer regardless of success/failure
    const bufferLength = this.buffer.length;
    this.buffer = [];
    
    if (bulkResult.success) {
      console.log('\n' + JSON.stringify(operations, null, 2), '🟢 Bulk index operations');

      logger.info('🎉ADDED documents to index 🎉');

    } else {

      if (this.metrics) {
        this.metrics.getMeter('elasticsearch').createCounter('es.documents.failed').add(
          bufferLength,
          { index: this.index }
        );
      }
      logger.info(bulkResult as Record<string, any>, '❌FAILED to add documents to index ❌');
      return failure(bulkResult.error);
    }
    
    // Process results
    const result = bulkResult.data;
    
    if (this.metrics) {
      this.metrics.getMeter('elasticsearch').createCounter('es.documents.indexed').add(
        bufferLength - (result.errors ? this.countErrors(result.items) : 0),
        { index: this.index }
      );
      
      if (result.errors) {
        this.metrics.getMeter('elasticsearch').createCounter('es.documents.failed').add(
          this.countErrors(result.items),
          { index: this.index }
        );
      }
    }
    
    if (result.errors) {
      logger.warn({ 
        index: this.index, 
        errorCount: this.countErrors(result.items),
        successCount: bufferLength - this.countErrors(result.items)
      }, 'Some documents failed to index');
    } else {
      logger.info({ index: this.index, count: bufferLength }, 'Successfully indexed all documents');
    }
    
    return success(undefined);
  }

  /**
   * Shutdown the bulk indexer
   * 
   * @returns Result indicating success or failure
   */
  public async shutdown(): Promise<Result<void>> {
    this.isShuttingDown = true;
    
    logger.info({ bufferLength: this.buffer.length, index: this.index }, 'Shutting down bulk indexer');
    
    // Stop the timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    // Flush any remaining documents
    if (this.buffer.length > 0) {
      return this.flush();
    }
    
    return success(undefined);
  }

  /**
   * Start the timer to flush the buffer at regular intervals
   */
  private startTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(async () => {
      if (this.buffer.length > 0) {
        await this.flush();
      }
      
      if (!this.isShuttingDown) {
        this.startTimer();
      }
    }, this.flushInterval);
  }

  /**
   * Count the number of errors in a bulk response
   * 
   * @param items Bulk response items
   * @returns Number of errors
   */
  private countErrors(items: any[]): number {
    return items.filter(item => {
      const action = Object.keys(item)[0];
      return item[action].error != null;
    }).length;
  }
}
