/**
 * BaseExporter.ts - Base Class for Batch Exporters
 *
 * This file defines the BaseExporter class and related interfaces for exporting batch files.
 * It provides a foundation for implementing custom exporters that handle file uploads, status tracking,
 * and result reporting in the batch processing framework.
 *
 * What does this file do?
 * - Defines the base class and interfaces for batch exporters
 * - Supports configuration for S3 and other destinations
 * - Handles common export job logic and result structures
 *
 * How do you use it?
 * - Extend the BaseExporter class to create custom exporters for new destinations
 * - Use the provided interfaces to structure export job configs and results
 *
 * Why is this important?
 * - Standardizes export logic for batch processing
 * - Makes it easy for new developers to add new export targets
 *
 * @module common/framework/batch/exporters/BaseExporter
 */
import {S3Service} from '@platform/services';

import {logger} from '@platform/core';
import * as path from 'path';
import {ConfigProvider} from "@platform/configuration";
import {S3BatchDownloader} from "./S3BatchDownloader";
import {generateS3Key} from "../utils";
import * as crypto from 'crypto';
import {BatchFileStatus, BatchFileTrackingService} from "./BatchFileTrackingService";
import {CONFIG} from "@platform/configuration";

export interface ExporterConfig {
    s3Bucket: string;
    s3Prefix: string;
    downloader?: boolean; // Whether to use year/month/day partitioning
}

export interface ExportJobResult {
    s3Key: string;
    recordCount?: number;
    metadata?: Record<string, any>;
}

/**
 * Base abstract class for CRM batch exporters
 * Provides common functionality for S3 uploads, file tracking, and error handling
 */
export abstract class BaseExporter {

    private downloader: S3BatchDownloader;
    private config: { s3Bucket: any; s3Prefix: any };
    protected batchService: BatchFileTrackingService;
    private s3Service: S3Service;

    constructor() {
        this.s3Service = new S3Service();
        this.batchService = new BatchFileTrackingService();

        // Create config with defaults
        this.config = {
            s3Bucket: ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_BUCKET, 'crmdata'),
            s3Prefix: ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_PREFIX, 'exports')
        };

        // Initialize the downloader
        this.downloader = new S3BatchDownloader(
            this.s3Service,
            this.batchService,
            {
                s3Bucket: this.config.s3Bucket,
                s3Prefix: this.config.s3Prefix,
            }
        );
    }

    /**
     * Main method to export data from a CRM to S3
     * This orchestrates the entire export process
     */
    async exportToS3(
        fileUrl: string,
        businessId: string,
        crm: string,
        businessPrefix: string,
        source: string): Promise<string> {

        logger.info('Starting batch export job');
        
        // Extract filename from URL, handling both regular URLs and file paths
        let fileName;
        try {
            // Try to parse as URL first
            const url = new URL(fileUrl);
            const pathname = url.pathname;
            fileName = path.basename(pathname);
            logger.debug({
                originalUrl: fileUrl,
                parsedPathname: pathname,
                extractedFileName: fileName
            }, 'Successfully parsed URL');
        } catch (error) {
            // If URL parsing fails, treat as a regular file path
            fileName = path.basename(fileUrl);
            logger.debug({
                originalUrl: fileUrl,
                extractedFileName: fileName,
                error: (error as Error).message
            }, 'Failed to parse URL, using direct basename');
        }
        
        const fileExtension = path.extname(fileName);
        const fileNameWithoutExt = fileName.replace(fileExtension, '');
        const fid = String(businessId).padStart(6, '0');

        logger.debug({
            fileName,
            fileExtension,
            fileNameWithoutExt,
            fid,
            businessPrefix,
            source,
            crm
        }, 'Preparing to generate S3 key with these parameters');

        // Generate S3 key with date partitioning if enabled
        const bucket = this.config.s3Bucket || ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_BUCKET);
        
        // Ensure all parameters are defined before calling generateS3Key
        if (!this.config.s3Prefix) {
            logger.error({}, 's3Prefix is undefined');
        }
        if (!crm) {
            logger.error({}, 'crm is undefined');
        }
        if (!fid) {
            logger.error({}, 'fid is undefined');
        }
        if (!businessPrefix) {
            logger.error({}, 'businessPrefix is undefined');
        }
        if (!source) {
            logger.error({}, 'source is undefined');
        }
        if (!fileNameWithoutExt) {
            logger.error({}, 'fileNameWithoutExt is undefined');
        }
        
        const fullPrefix = generateS3Key(
            this.config.s3Prefix || 'errors',
            crm || 'unknown', 
            fid || '000000', 
            businessPrefix || 'unknown', 
            source || 'unknown',
            fileName || 'unknown'
        );
        const s3Key = "s3://" + path.join(bucket, fullPrefix);
        
        // Generate file path hash - will be used for both S3 metadata and batch tracking
        const filePathHash = crypto.createHash('sha256').update(s3Key).digest('hex');

        // Determine file type based on extension
        const fileType = this.determineFileType(fileExtension);

        try {

            // Execute CRM-specific export logic
            const response = await this.downloader.downloadUrlToS3(
                fileUrl,
                bucket,
                fullPrefix,
                {
                    metadata: {
                        'file-path-hash': filePathHash,
                        'business-id': businessId,
                        'crm': crm,
                        'source': source,
                        'file-type': fileType
                    }
                }
            );

            if (!response.success) {
                throw new Error(`Failed to download URL to S3: ${fileUrl}`);
            }

            await this.batchService.registerFile({
                businessId,
                filePath: s3Key,
                fileName: path.basename(s3Key),
                fileTimestamp: new Date().toISOString(),
                status: BatchFileStatus.DOWNLOADED
            }, filePathHash); // Pass the pre-computed hash

            logger.info({s3Key}, 'Export completed and uploaded to S3');
            return s3Key;

        } catch (error) {
            logger.error({error}, 'Export job failed');

            // Update file status to failed
            await this.batchService.registerFile({
                businessId,
                filePath: s3Key,
                fileName: path.basename(s3Key),
                fileTimestamp: new Date().toISOString(),
                status: BatchFileStatus.DOWNLOAD_FAILED,
            }, filePathHash);
            throw error;
        }
    }

    /**
     * Determine file type based on file extension
     * @param extension File extension including the dot (e.g., '.csv')
     * @returns File type string ('csv', 'jsonl', etc.)
     */
    private determineFileType(extension: string): string {
        switch (extension.toLowerCase()) {
            case '.csv':
                return 'csv';
            case '.jsonl':
            case '.ndjson':
                return 'jsonl';
            case '.json':
                // For .json files, we assume it's JSON Lines format
                // This could be refined if needed
                return 'jsonl';
            default:
                // Default to 'unknown' for unsupported types
                return 'unknown';
        }
    }
 }
