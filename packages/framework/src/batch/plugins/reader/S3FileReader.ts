/**
 * S3FileReader.ts - S3 File Reader for Batch Processing
 *
 * This file implements the S3FileReader class for listing and reading files from S3 buckets in batch repositories.
 * It provides methods for integrating S3 storage with the batch processing framework.
 *
 * What does this file do?
 * - Implements FileReader for S3 buckets
 * - Lists and reads files from S3 for batch repositories
 *
 * How do you use it?
 * - Instantiate S3FileReader with a bucket and prefix
 * - Use its methods to list and read files in batch repositories
 *
 * Why is this important?
 * - Enables direct integration with S3 for file-based batch processing
 * - Helps new developers understand S3 access patterns in the framework
 *
 * @module common/framework/batch/plugins/reader/S3FileReader
 */
// Example S3 file reader (stub)
import {FileListElement, FileReader} from './FileReader';
import {S3Service} from "@platform/services";
import {logger} from '@platform/core';

export class S3FileReader implements FileReader {
  constructor(private bucket: string, private prefix: string = 'exports') {}

  async listFiles(folder: string): Promise<any> {
    try {
      // Always use forward slashes for S3 paths, not platform-specific path.join
      // S3 prefixes should NOT start with a leading slash
      const prefix = this.prefix ? `${this.prefix}/${folder}` : folder;
      logger.debug(`S3FileReader.listFiles: Listing S3 objects in bucket: ${this.bucket}, prefix: ${prefix}`);
      const keys = await S3Service.listObjects(this.bucket, prefix);
      return keys;

    } catch(err) {
        logger.error(err, 'Error listing files in S3:');
        throw new Error(`Failed to list files in S3 bucket ${this.bucket}: ${(err as Error).message}`);
    }
  }

  async *openFile(file: FileListElement): AsyncIterable<Buffer> {
    try {
      const streamResult = await S3Service.getObjectStream(this.bucket, file.path);
      
      if (!streamResult.success) {
        throw new Error(`Failed to get S3 stream: ${streamResult.error.message}`);
      }
      
      const stream = streamResult.data;
      for await (const chunk of stream) {
        yield chunk as Buffer;
      }
    } catch (error) {
      logger.error(error,`Error reading file ${file.path} from S3:`);
      throw error;
    }
  }
}
