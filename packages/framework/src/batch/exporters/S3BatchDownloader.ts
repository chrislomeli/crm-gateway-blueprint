/**
 * S3BatchDownloader.ts - S3 Batch File Downloader
 *
 * This file implements logic for downloading batch files from S3 as part of the export process.
 * It defines configuration options, handles partitioning, and supports integration with the batch framework.
 *
 * What does this file do?
 * - Downloads batch files from S3 for export repositories
 * - Supports date partitioning and custom S3 paths
 * - Provides configuration interfaces for flexible usage
 *
 * How do you use it?
 * - Use as part of the batch export pipeline to retrieve files from S3
 * - Configure bucket, prefix, and partitioning as needed
 *
 * Why is this important?
 * - Enables reliable export of batch files from S3
 * - Helps new developers understand S3 integration in the export process
 *
 * @module common/framework/batch/exporters/S3BatchDownloader
 */
import {S3Service} from '@platform/services';
import {BatchFileTrackingService} from './BatchFileTrackingService';
import {failureFromError, logger, Result, success} from '@platform/core';
import * as path from 'path';
import {toS3URL} from "../utils/S3Utils";
import * as crypto from 'crypto';

export interface S3BatchDownloaderConfig {
  s3Bucket: string;
  s3Prefix: string;
  datePartitioning?: boolean; // Whether to use year/month/day partitioning
}

/**
 * Utility class for downloading data from URLs to S3 with batch file tracking
 * This is a focused utility that handles the common "download URL to S3" pattern
 * used by CRM batch exporters
 */
export class S3BatchDownloader {
  private readonly log = logger;
  
  constructor(
    private s3Service: S3Service,
    private batchService: BatchFileTrackingService,
    private config: S3BatchDownloaderConfig
  ) {}

  /**
   * Download data from a URL to S3 and track it in the batch system
   *
   * @param downloadUrl The URL to download data from
   * @param s3Bucket S3 bucket name
   * @param fullPrefix S3 key prefix
   * @param options Additional options including headers for the download request
   * @returns The S3 key where the file was stored
   */
  async downloadUrlToS3(
    downloadUrl: string,
    s3Bucket: string,
    fullPrefix: string,
    options: {
      headers?: Record<string, string>;
      metadata?: Record<string, any>;
      recordCount?: number;
    } = {}
  ): Promise<Result<string>> {

    logger.info('Starting download to S3');
    try {
        // Generate the full S3 URL
        const s3Url = toS3URL(s3Bucket, fullPrefix);
        
        // Generate file path hash - this will be used for both S3 metadata and batch tracking
        const filePathHash = crypto.createHash('sha256').update(s3Url).digest('hex');
        
        // Determine file type based on the URL or fullPrefix
        const fileType = this.determineFileType(fullPrefix);
        
        // Add the file path hash to the metadata
        const metadata = {
          ...options.metadata,
          'file-path-hash': filePathHash,
          'source': 'batch-importer',
          'file-type': fileType
        };
        
        // Stream the file to S3 with metadata
        const response = await S3Service.streamUrlToS3(
          downloadUrl, 
          s3Bucket, 
          fullPrefix, 
          options.headers,
          metadata
        );
        
        console.log('Successfully streamed from URL to S3:', response);
        return success(s3Url);
    } catch (error) {
      logger.error({ error }, 'Download to S3 failed');
      return failureFromError(error as Error);
    }
  }

  /**
   * Determine file type based on file path or name
   * @param filePath File path or name
   * @returns File type string ('csv', 'jsonl', etc.)
   */
  private determineFileType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    
    switch (extension) {
      case '.csv':
        return 'csv';
      case '.jsonl':
      case '.ndjson':
        return 'jsonl';
      case '.json':
        // For .json files, we assume it's JSON Lines format
        return 'jsonl';
      default:
        // Default to 'unknown' for unsupported types
        return 'unknown';
    }
  }
}
