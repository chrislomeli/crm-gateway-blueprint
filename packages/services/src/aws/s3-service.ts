/**
 * S3Service - AWS S3 Integration
 * 
 * This service provides a standardized interface for interacting with AWS S3.
 * It handles all S3 operations including listing, uploading, downloading, and checking objects.
 * 
 * Key features:
 * - Singleton pattern for S3 client to minimize connection overhead
 * - Environment-aware configuration (works with local development and AWS)
 * - Comprehensive error handling using the Result pattern
 * - Support for both file and stream operations
 * - Built-in logging and observability
 * 
 * This service is used by the batch processing framework to access CRM data files
 * stored in S3 buckets, but can be used by any component needing S3 access.
 * 
 * @module aws/S3Service
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, ListObjectsV2CommandOutput, PutObjectCommand, HeadObjectCommand, HeadObjectCommandOutput, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Result, success, failure, tryResultAsync, AppErrorType, getErrorInfo, logger } from '@platform/core';
import { AwsClientFactory } from './aws-client-factory';

export class S3Service {
    private static client: S3Client | null = null;

    /**
     * Get a singleton instance of the S3 client
     * Creates the client if it doesn't exist
     */
    private static getS3Client(): S3Client {
        if (!this.client) {
            this.client = AwsClientFactory.createS3Client();
        }
        return this.client;
    }

    static async listObjects(bucket: string, prefix = '', maxKeys?: number): Promise<Result<ListObjectsV2CommandOutput['Contents'] | []>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.listObjects: Listing objects in bucket '${bucket}' with prefix '${prefix}'`);
                
                const client = this.getS3Client();
                const command = new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    MaxKeys: maxKeys
                });
                
                const response = await client.send(command);
                return response.Contents || [];
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'listObjects',
                data: { bucket, prefix }
            }
        );
    }

    static async getObjectStream(bucket: string, key: string): Promise<Result<Readable>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.getObjectStream: Getting stream for '${key}' from bucket '${bucket}'`);
                
                const client = this.getS3Client();
                const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                const response = await client.send(command);
                
                if (!response.Body) {
                    throw new Error('No body in S3 response');
                }
                
                return response.Body as Readable;
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'getObjectStream',
                data: { bucket, key }
            }
        );
    }

    /**
     * Count the number of rows in an S3 file
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @param format File format ('csv' or 'jsonlines')
     * @returns Number of rows in the file
     */
    static async countRows(bucket: string, key: string, format: 'csv' | 'jsonlines'): Promise<Result<number>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.countRows: Counting rows in '${key}' from bucket '${bucket}' (format: ${format})`);
                
                // Get the stream using our Results-returning method
                const streamResult = await this.getObjectStream(bucket, key);
                if (streamResult.success === false) {
                    throw new Error(`Failed to get object stream: ${streamResult.error.message}`);
                }
                const stream = streamResult.data;
                
                let rowCount = 0;
                let buffer = '';

                return new Promise<number>((resolve, reject) => {
                    stream.on('data', (chunk: Buffer) => {
                        const chunkStr = buffer + chunk.toString();
                        let lastNewlineIndex = chunkStr.lastIndexOf('\n');

                        if (lastNewlineIndex === -1) {
                            // No complete line yet, add to buffer
                            buffer = chunkStr;
                            return;
                        }

                        // Process complete lines
                        const lines = chunkStr.substring(0, lastNewlineIndex).split('\n');
                        buffer = chunkStr.substring(lastNewlineIndex + 1);

                        // Count valid rows based on format
                        if (format === 'csv') {
                            // For CSV, first line is header, so we don't count it
                            if (rowCount === 0 && lines.length > 0) {
                                rowCount += lines.length - 1;
                            } else {
                                rowCount += lines.length;
                            }
                        } else {
                            // For JSON Lines, each line should be a valid JSON object
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        JSON.parse(line);
                                        rowCount++;
                                    } catch (e) {
                                        // Invalid JSON line, skip
                                        logger.debug({ key, line: line.substring(0, 50) }, 'Invalid JSON line in S3 object, skipping');
                                    }
                                }
                            }
                        }
                    });

                    stream.on('end', () => {
                        // Process any remaining data in buffer
                        if (buffer.trim()) {
                            const lines = buffer.split('\n');

                            if (format === 'csv') {
                                rowCount += lines.length;
                            } else {
                                for (const line of lines) {
                                    if (line.trim()) {
                                        try {
                                            JSON.parse(line);
                                            rowCount++;
                                        } catch (e) {
                                            // Invalid JSON line, skip
                                        }
                                    }
                                }
                            }
                        }

                        resolve(rowCount);
                    });

                    stream.on('error', (err: Error) => {
                        reject(new Error(`Error counting rows in ${key}: ${err.message}`));
                    });
                });
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'countRows',
                data: { bucket, key }
            }
        );
    }

    /**
     * Download a file from S3 to local filesystem
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @param localPath Local file path to save to
     */
    static async downloadFile(bucket: string, key: string, localPath: string): Promise<Result<void>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.downloadFile: Downloading '${key}' from bucket '${bucket}' to '${localPath}'`);
                
                const client = this.getS3Client();
                const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                const response = await client.send(command);

                if (!response.Body) {
                    throw new Error('No body in S3 response');
                }

                // Ensure directory exists
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Create write stream and pipe S3 stream to it
                const writeStream = fs.createWriteStream(localPath);
                const readableStream = response.Body as Readable;

                return new Promise<void>((resolve, reject) => {
                    readableStream.pipe(writeStream);
                    writeStream.on('finish', () => {
                        logger.info(`S3Service.downloadFile: Successfully downloaded '${key}' to '${localPath}'`);
                        resolve();
                    });
                    writeStream.on('error', (err: Error) => {
                        logger.error({ err }, `S3Service.downloadFile: Error writing file '${localPath}'`);
                        reject(err);
                    });
                    readableStream.on('error', (err: Error) => {
                        logger.error({ err }, `S3Service.downloadFile: Error reading from S3`);
                        reject(err);
                    });
                });
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'downloadFile',
                data: { bucket, key, localPath }
            }
        );
    }

    /**
     * Upload a file from local path to S3
     * @param localPath Local file path to upload
     * @param bucket S3 bucket name
     * @param key S3 object key
     */
    static async uploadFile(localPath: string, bucket: string, key: string): Promise<Result<void>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.uploadFile: Uploading ${localPath} to bucket ${bucket} as ${key}`);

                // Read the file
                const fileContent = await fs.promises.readFile(localPath);

                // Upload to S3
                const client = this.getS3Client();
                const command = new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: fileContent
                });

                await client.send(command);
                logger.info(`S3Service.uploadFile: Successfully uploaded ${localPath} to ${bucket}/${key}`);
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'uploadFile',
                data: { localPath, bucket, key }
            }
        );
    }

    static async headObject(params: { Bucket: string, Key: string }): Promise<Result<HeadObjectCommandOutput>> {
        return await tryResultAsync(
            async () => {
                const client = this.getS3Client();
                const command = new HeadObjectCommand(params);
                return await client.send(command);
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'headObject',
                data: { bucket: params.Bucket, key: params.Key }
            }
        );
    }

    /**
     * Get metadata for an S3 object
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @returns Object metadata including user-defined metadata
     */
    static async getObjectMetadata(bucket: string, key: string): Promise<Result<Record<string, string>>> {
        return await tryResultAsync(
            async () => {
                logger.info({ bucket, key }, 'S3Service.getObjectMetadata: Getting metadata for object' );
                const headResult = await this.headObject({ Bucket: bucket, Key: key });
                
                if (headResult.success === false) {
                    throw new Error(`Failed to get object metadata: ${headResult.error.message}`);
                }
                
                const response = headResult.data;

                // Extract and normalize metadata
                const metadata: Record<string, string> = {};

                // Add standard metadata
                if (response.ContentType) metadata['content-type'] = response.ContentType;
                if (response.ContentLength) metadata['content-length'] = response.ContentLength.toString();
                if (response.LastModified) metadata['last-modified'] = response.LastModified.toISOString();

                // Add user-defined metadata (these are prefixed with 'x-amz-meta-' in the raw response)
                if (response.Metadata) {
                    Object.entries(response.Metadata).forEach(([key, value]) => {
                        if (value) metadata[key] = value;
                    });
                }

                logger.info({ bucket, key, metadataKeys: Object.keys(metadata) }, 'S3Service.getObjectMetadata: Retrieved metadata');
                return metadata;
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'getObjectMetadata',
                data: { bucket, key }
            }
        );
    }

    /**
     * Get an object from S3
     * @param params Object containing Bucket and Key
     * @returns GetObjectCommandOutput containing the object data
     */
    static async getObject(params: { Bucket: string, Key: string }): Promise<Result<GetObjectCommandOutput>> {
        return await tryResultAsync(
            async () => {
                const client = this.getS3Client();
                const command = new GetObjectCommand(params);
                const result = await client.send(command);
                if (!result.Body) {
                    throw new Error(`No body returned for object ${params.Key} in bucket ${params.Bucket}`);
                }
                return result;
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'getObject',
                data: { bucket: params.Bucket, key: params.Key }
            }
        );
    }

    /**
     * Stream data from a URL directly to S3 using multipart uploads
     * This avoids storing the entire file in memory or on disk
     * 
     * @param url The URL to stream from
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @param headers Optional headers to include in the HTTP request
     * @param metadata Optional metadata to attach to the S3 object
     * @returns Promise that resolves when the upload is complete
     */
    static async streamUrlToS3(url: string, bucket: string, key: string, headers: Record<string, string> = {}, metadata?: Record<string, string>): Promise<Result<void>> {
        return await tryResultAsync(
            async () => {
                logger.info({ url, bucket, key },'S3Service.streamUrlToS3: Streaming from URL to S3');
                // Get the S3 client
                const client = this.getS3Client();

                // Create a source stream based on URL protocol
                let sourceStream: Readable;

                if (url.startsWith('file://')) {
                    // For file:// URLs, use fs.createReadStream directly
                    const filePath = url.replace('file://', '');
                    logger.debug( { filePath }, 'Using fs.createReadStream for file:// URL');
                    sourceStream = fs.createReadStream(filePath);
                } else {
                    // For http/https URLs, use axios
                    const response = await axios({
                        method: 'GET',
                        url,
                        headers,
                        responseType: 'stream'
                    });
                    sourceStream = response.data as Readable;
                }

                // Create a multipart upload using the Upload class from @aws-sdk/lib-storage
                const upload = new Upload({
                    client,
                    params: {
                        Bucket: bucket,
                        Key: key,
                        Body: sourceStream,
                        Metadata: metadata
                    },
                    // Optional configuration for multipart upload
                    queueSize: 4, // Number of concurrent uploads
                    partSize: 5 * 1024 * 1024, // 5MB part size (minimum allowed by S3)
                    leavePartsOnError: false // Clean up parts if upload fails
                });

                // Add progress tracking
                upload.on('httpUploadProgress', (progress: any) => {
                    if (progress.loaded && progress.total) {
                        const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                        logger.debug( {
                            bucket,
                            key,
                            loaded: progress.loaded,
                            total: progress.total,
                            percent: percentComplete
                        }, `Upload progress: ${percentComplete}%`);
                    }
                });

                // Start the upload
                await upload.done();
                logger.info({ url, bucket, key }, 'S3Service.streamUrlToS3: Successfully streamed from URL to S3');
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'streamUrlToS3',
                data: { url, bucket, key }
            }
        );
    }

    /**
     * Generate a pre-signed URL for an S3 object
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @param expiresIn Expiration time in seconds (default: 3600 = 1 hour)
     * @returns Pre-signed URL for the object
     */
    static async getSignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<Result<string>> {
        return await tryResultAsync(
            async () => {
                const client = this.getS3Client();
                const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                return await getSignedUrl(client, command, { expiresIn });
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'getSignedUrl',
                data: { bucket, key }
            }
        );
    }

    /**
     * Upload a temporary file to S3 and return a pre-signed URL
     * This is specifically designed for test services to provide Docker-friendly URLs
     * 
     * @param localPath Path to the local file to upload
     * @param fileName Name to use for the file in S3 (without the tmp/ prefix)
     * @param expiresIn URL expiration time in seconds (default: 24 hours)
     * @returns Result containing the pre-signed URL
     */
    static async uploadTempFileAndGetUrl(localPath: string, fileName: string, expiresIn = 86400): Promise<Result<string>> {
        return await tryResultAsync(
            async () => {
                const bucket = 'crmdata';
                const key = `tmp/${fileName}`;
                
                logger.info(`S3Service.uploadTempFileAndGetUrl: Uploading ${localPath} to bucket ${bucket} as ${key}`);
                
                // Read file content
                const fileContent = await fs.promises.readFile(localPath);
                
                // Determine content type based on file extension
                const contentType = fileName.endsWith('.jsonl') ? 'application/jsonl' : 
                                   fileName.endsWith('.csv') ? 'text/csv' : 
                                   'application/octet-stream';
                
                // Upload to S3
                const client = this.getS3Client();
                const putCommand = new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: fileContent,
                    ContentType: contentType
                });
                
                await client.send(putCommand);
                logger.info(`S3Service.uploadTempFileAndGetUrl: Successfully uploaded ${localPath} to ${bucket}/${key}`);
                
                // Generate pre-signed URL
                const getCommand = new GetObjectCommand({
                    Bucket: bucket,
                    Key: key
                });
                
                const url = await getSignedUrl(client, getCommand, { expiresIn });
                
                // Make URL Docker-friendly by replacing localhost with service name if needed
                const dockerFriendlyUrl = url.replace('localhost', 'fake-crm-api');
                
                logger.info(`S3Service.uploadTempFileAndGetUrl: Generated pre-signed URL: ${dockerFriendlyUrl}`);
                
                return dockerFriendlyUrl;
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'uploadTempFileAndGetUrl',
                data: { localPath, fileName, expiresIn }
            }
        );
    }

    /**
     * Generate a pre-signed URL for an existing S3 object
     * @param bucket S3 bucket name
     * @param key S3 object key
     * @param expiresIn URL expiration time in seconds (default: 1 hour)
     * @returns Result containing the pre-signed URL
     */
    static async getPresignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<Result<string>> {
        return await tryResultAsync(
            async () => {
                logger.info(`S3Service.getPresignedUrl: Generating pre-signed URL for ${bucket}/${key}`);
                
                const client = this.getS3Client();
                const command = new GetObjectCommand({
                    Bucket: bucket,
                    Key: key
                });
                
                const url = await getSignedUrl(client, command, { expiresIn });
                
                logger.info(`S3Service.getPresignedUrl: Generated pre-signed URL for ${bucket}/${key}`);
                return url;
            },
            AppErrorType.UPSTREAM_ERROR,
            { 
                operation: 'getPresignedUrl',
                data: { bucket, key, expiresIn }
            }
        );
    }
}
