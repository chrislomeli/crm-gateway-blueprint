/**
 * Batch Core Integration Tests
 * 
 * Tests the three core batch framework components with LocalStack MySQL:
 * - BatchFileTrackingService: File lifecycle management
 * - FileProcessorService: Chunk processing with error handling
 * - TrackedCsvBatchReader: CSV streaming with progress tracking
 * 
 * These tests use the actual LocalStack database to validate real integration behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { BatchFileTrackingService, BatchFileStatus } from '../services/file-tracking/BatchFileTrackingService';
import { FileProcessorService } from '../services/file-tracking/FileProcessorService';
import { TrackedCsvBatchReader } from '../plugins/reader/TrackedCsvBatchReader';
import { ConfigProvider } from '@platform/configuration';
import { MySQLService } from '@platform/connectors';
import { S3Service } from '@platform/services';

// Test data
const TEST_BUSINESS_ID = 'test-business-123';
const TEST_CSV_DATA = `Record ID,First Name,Last Name,Email,Phone
1,John,Doe,john.doe@example.com,555-0101
2,Jane,Smith,jane.smith@example.com,555-0102
3,Bob,Johnson,bob.johnson@example.com,555-0103
4,Alice,Williams,alice.williams@example.com,555-0104
5,Charlie,Brown,charlie.brown@example.com,555-0105`;

const INVALID_CSV_DATA = `Record ID,First Name,Last Name,Email,Phone
1,John,Doe,john.doe@example.com,555-0101
2,Jane,Smith,jane.smith@example.com,555-0102
INVALID_LINE_HERE
3,Bob,Johnson,bob.johnson@example.com,555-0103`;

describe('Batch Core Integration Tests', () => {
  let batchService: BatchFileTrackingService;
  let processorService: FileProcessorService;

  beforeAll(async () => {
    // Initialize configuration
    await ConfigProvider.initialize();
    
    // Ensure database tables exist
    await setupTestTables();
  });

  beforeEach(async () => {
    // Create fresh service instances
    batchService = new BatchFileTrackingService();
    processorService = new FileProcessorService(
      batchService,
      new S3Service(), // Create actual S3Service instance
      {
        s3Bucket: 'test-bucket',
        s3Prefix: 'test-prefix',
        tempDir: '/tmp/batch-test',
        chunkSize: 2, // Small chunk size for testing
        systemUnavailabilityThreshold: 80
      }
    );

    // Clean up test data
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('BatchFileTrackingService', () => {
    it('should register a file and track its lifecycle', async () => {
      const filePath = 's3://test-bucket/test-file.csv';
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath,
        fileName: 'test-file.csv',
        fileTimestamp: new Date().toISOString(),
        fileSize: 1000,
        totalRecords: 5,
        status: BatchFileStatus.PENDING
      };

      // Register file
      const filePathHash = batchService.generateFilePathHash(filePath);
      const fileId = await batchService.registerFile(fileInfo, filePathHash);
      
      expect(fileId).toBeTypeOf('number');
      expect(fileId).toBeGreaterThan(0);

      // Verify file was registered
      const retrievedFile = await batchService.getFileById(fileId!);
      expect(retrievedFile).toBeTruthy();
      expect(retrievedFile!.businessId).toBe(TEST_BUSINESS_ID);
      expect(retrievedFile!.filePath).toBe(filePath);
      expect(retrievedFile!.status).toBe(BatchFileStatus.PENDING);

      // Update file status to processing
      const updateResult = await batchService.updateFileStatus(fileId!, BatchFileStatus.PROCESSING, {
        processedRecords: 2,
        lastChunk: '2'
      });
      expect(updateResult).toBe(true);

      // Verify status update
      const updatedFile = await batchService.getFileById(fileId!);
      expect(updatedFile!.status).toBe(BatchFileStatus.PROCESSING);
      expect(updatedFile!.processedRecords).toBe(2);
      expect(updatedFile!.lastChunk).toBe('2');

      // Complete file processing
      const completeResult = await batchService.updateFileStatus(fileId!, BatchFileStatus.SUCCESS, {
        processedRecords: 5,
        successfulRecords: 5,
        recordsFailed: 0
      });
      expect(completeResult).toBe(true);

      // Verify completion
      const completedFile = await batchService.getFileById(fileId!);
      expect(completedFile!.status).toBe(BatchFileStatus.SUCCESS);
      expect(completedFile!.processedRecords).toBe(5);
      expect(completedFile!.completedAt).toBeTruthy();
    });

    it('should handle duplicate file registration', async () => {
      const filePath = 's3://test-bucket/duplicate-test.csv';
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath,
        fileName: 'duplicate-test.csv',
        fileTimestamp: new Date().toISOString(),
        status: BatchFileStatus.PENDING
      };

      const filePathHash = batchService.generateFilePathHash(filePath);

      // Register file first time
      const fileId1 = await batchService.registerFile(fileInfo, filePathHash);
      expect(fileId1).toBeTypeOf('number');

      // Register same file again - should return existing ID
      const fileId2 = await batchService.registerFile(fileInfo, filePathHash);
      expect(fileId2).toBe(fileId1);
    });

    it('should get last completed file for tenant', async () => {
      const filePath1 = 's3://test-bucket/file1.csv';
      const filePath2 = 's3://test-bucket/file2.csv';
      
      // Register and complete first file
      const fileInfo1 = {
        businessId: TEST_BUSINESS_ID,
        filePath: filePath1,
        fileName: 'file1.csv',
        fileTimestamp: '2024-01-01T10:00:00Z',
        status: BatchFileStatus.PENDING
      };
      
      const fileId1 = await batchService.registerFile(fileInfo1, batchService.generateFilePathHash(filePath1));
      await batchService.updateFileStatus(fileId1!, BatchFileStatus.SUCCESS);

      // Register and complete second file (more recent)
      const fileInfo2 = {
        businessId: TEST_BUSINESS_ID,
        filePath: filePath2,
        fileName: 'file2.csv',
        fileTimestamp: '2024-01-02T10:00:00Z',
        status: BatchFileStatus.PENDING
      };
      
      const fileId2 = await batchService.registerFile(fileInfo2, batchService.generateFilePathHash(filePath2));
      await batchService.updateFileStatus(fileId2!, BatchFileStatus.SUCCESS);

      // Get last completed file
      const lastFile = await batchService.getLastCompletedFile(TEST_BUSINESS_ID);
      expect(lastFile).toBeTruthy();
      expect(lastFile!.file_path).toBe(filePath2); // Should be the more recent file
    });
  });

  describe('TrackedCsvBatchReader', () => {
    it('should read CSV data in chunks with progress tracking', async () => {
      // Register a test file
      const filePath = 's3://test-bucket/tracked-csv-test.csv';
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath,
        fileName: 'tracked-csv-test.csv',
        fileTimestamp: new Date().toISOString(),
        totalRecords: 5,
        status: BatchFileStatus.PENDING
      };

      const fileId = await batchService.registerFile(fileInfo, batchService.generateFilePathHash(filePath));
      expect(fileId).toBeTypeOf('number');

      // Create CSV reader with small chunk size
      const reader = new TrackedCsvBatchReader({
        fileId: fileId!,
        businessId: TEST_BUSINESS_ID,
        filePath,
        batchService,
        chunkSize: 2, // Small chunks for testing
        hasHeaderRow: true
      });

      // Create readable stream from test data
      const inputStream = Readable.from([TEST_CSV_DATA]);
      
      const chunks: any[] = [];
      
      // Process the stream
      await pipeline(
        inputStream,
        reader,
        async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk);
            yield chunk;
          }
        }
      );

      // Verify chunks were created
      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify chunk structure
      const firstChunk = chunks[0];
      expect(firstChunk).toHaveProperty('records');
      expect(firstChunk).toHaveProperty('offset');
      expect(firstChunk).toHaveProperty('chunkIdentifier');
      expect(firstChunk.records.length).toBeLessThanOrEqual(2); // Chunk size

      // Verify records have expected structure
      const firstRecord = firstChunk.records[0];
      expect(firstRecord).toHaveProperty('Record ID');
      expect(firstRecord).toHaveProperty('First Name');
      expect(firstRecord).toHaveProperty('Email');

      // Verify file status was updated during processing
      const updatedFile = await batchService.getFileById(fileId!);
      expect(updatedFile!.status).toBe(BatchFileStatus.PROCESSING);
    });

    it('should handle CSV parsing errors gracefully', async () => {
      const filePath = 's3://test-bucket/invalid-csv-test.csv';
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath,
        fileName: 'invalid-csv-test.csv',
        fileTimestamp: new Date().toISOString(),
        status: BatchFileStatus.PENDING
      };

      const fileId = await batchService.registerFile(fileInfo, batchService.generateFilePathHash(filePath));

      const reader = new TrackedCsvBatchReader({
        fileId: fileId!,
        businessId: TEST_BUSINESS_ID,
        filePath,
        batchService,
        chunkSize: 10,
        hasHeaderRow: true
      });

      const inputStream = Readable.from([INVALID_CSV_DATA]);
      const chunks: any[] = [];

      // Should not throw, but should handle errors gracefully
      await pipeline(
        inputStream,
        reader,
        async function* (source) {
          for await (const chunk of source) {
            chunks.push(chunk);
            yield chunk;
          }
        }
      );

      // Should still produce chunks for valid records
      expect(chunks.length).toBeGreaterThan(0);
      
      // Should have processed the valid records
      const totalRecords = chunks.reduce((sum, chunk) => sum + chunk.records.length, 0);
      expect(totalRecords).toBe(3); // 3 valid records in INVALID_CSV_DATA
    });
  });

  describe('FileProcessorService', () => {
    it('should process file chunks and handle errors', async () => {
      // Create test file info
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath: 's3://test-bucket/processor-test.csv',
        fileName: 'processor-test.csv',
        fileTimestamp: new Date().toISOString(),
        totalRecords: 5,
        status: BatchFileStatus.PENDING
      };

      // Create a test processor that fails on specific records
      const testProcessor = async (records: any[]) => {
        const errors: any[] = [];
        const failedRecords: any[] = [];
        const processedRecords = records.filter(record => {
          // Fail processing for records with "Bob" in the name
          if (record['First Name'] === 'Bob') {
            errors.push({
              record,
              error: 'Test processing error for Bob',
              retryable: true
            });
            failedRecords.push(record);
            return false;
          }
          return true;
        });

        return {
          processedRecords: processedRecords.length,
          failedRecords,
          errors
        };
      };

      // Process the file using the correct API
      const result = await processorService.processFile(
        fileInfo,
        TEST_BUSINESS_ID,
        testProcessor
      );

      // Verify processing result using Result pattern
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recordsProcessed).toBe(5);
        expect(result.data.recordsFailed).toBe(1); // Just Bob
        expect(result.data.retryableErrors).toBe(1);
      }

      // Verify file status was updated - need to get file by path
      const finalFile = await batchService.selectBatchFilesRecord(TEST_BUSINESS_ID, fileInfo.filePath);
      expect(finalFile).toBeTruthy();
      expect(finalFile!.status).toBe(BatchFileStatus.PARTIAL_SUCCESS);
      expect(finalFile!.processedRecords).toBe(5);
    });

    it('should handle complete processing failure', async () => {
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath: 's3://test-bucket/fail-test.csv',
        fileName: 'fail-test.csv',
        fileTimestamp: new Date().toISOString(),
        totalRecords: 5,
        status: BatchFileStatus.PENDING
      };

      // Create a processor that fails all records
      const failingProcessor = async (records: any[]) => {
        const errors = records.map(record => ({
          record,
          error: 'Complete processing failure',
          retryable: false
        }));

        return {
          processedRecords: 0,
          failedRecords: records,
          errors
        };
      };

      const result = await processorService.processFile(
        fileInfo,
        TEST_BUSINESS_ID,
        failingProcessor
      );

      // Verify complete failure using Result pattern
      expect(result.success).toBe(true); // The processing itself succeeded, but all records failed
      if (result.success) {
        expect(result.data.recordsProcessed).toBe(5);
        expect(result.data.recordsFailed).toBe(5);
      }

      // Verify file status
      const finalFile = await batchService.selectBatchFilesRecord(TEST_BUSINESS_ID, fileInfo.filePath);
      expect(finalFile!.status).toBe(BatchFileStatus.FAILED);
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full file processing pipeline', async () => {
      const fileInfo = {
        businessId: TEST_BUSINESS_ID,
        filePath: 's3://test-bucket/e2e-test.csv',
        fileName: 'e2e-test.csv',
        fileTimestamp: new Date().toISOString(),
        totalRecords: 5,
        status: BatchFileStatus.PENDING
      };

      // Create successful processor
      const successfulProcessor = async (records: any[]) => ({
        processedRecords: records.length,
        failedRecords: [],
        errors: []
      });

      // Process file
      const result = await processorService.processFile(
        fileInfo,
        TEST_BUSINESS_ID,
        successfulProcessor
      );

      // Verify end-to-end results using Result pattern
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recordsProcessed).toBe(5);
        expect(result.data.recordsFailed).toBe(0);
      }

      // Verify final file state
      const finalFile = await batchService.selectBatchFilesRecord(TEST_BUSINESS_ID, fileInfo.filePath);
      expect(finalFile).toBeTruthy();
      expect(finalFile!.status).toBe(BatchFileStatus.SUCCESS);
      expect(finalFile!.processedRecords).toBe(5);
      expect(finalFile!.completedAt).toBeTruthy();

      // Verify it appears in last completed files
      const lastCompleted = await batchService.getLastCompletedFile(TEST_BUSINESS_ID);
      expect(lastCompleted).toBeTruthy();
      expect(lastCompleted!.file_path).toBe(fileInfo.filePath);
    });
  });
});

// Helper functions

async function setupTestTables(): Promise<void> {
  // Tables should already exist from LocalStack setup, but verify they're accessible
  const tablesQuery = `
    SELECT TABLE_NAME 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME IN ('batch_files', 'batch_processing_history', 'batch_tenants')
  `;
  
  const result = await MySQLService.CRM.query(tablesQuery);
  if (!result.success || !result.rows || result.rows.length < 3) {
    throw new Error('Required batch tables not found in database. Please run database migrations.');
  }
}

async function cleanupTestData(): Promise<void> {
  // Clean up test data
  await MySQLService.CRM.query(
    `DELETE FROM batch_processing_history WHERE file_id IN (
      SELECT id FROM batch_files WHERE business_id = ?
    )`,
    [TEST_BUSINESS_ID]
  );
  
  await MySQLService.CRM.query(
    `DELETE FROM batch_files WHERE business_id = ?`,
    [TEST_BUSINESS_ID]
  );
}
