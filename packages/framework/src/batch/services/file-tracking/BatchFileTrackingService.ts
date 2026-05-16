/**
 * BatchFileTrackingService - Batch File Processing Tracker
 *
 * This service provides a robust mechanism for tracking the lifecycle and status of
 * batch files processed by the Blueprint batch framework. It manages tenant and file
 * metadata, processing history, and supports reliable state transitions for file and
 * tenant processing.
 *
 * Key features:
 * - Tracks file and tenant processing status across the batch pipeline
 * - Integrates with MySQL for durable state management
 * - Provides interfaces for querying, updating, and auditing file/tenant status
 * - Supports error and retry tracking for robust batch operations
 * - Enables dashboard and monitoring integration
 *
 * This service is a core component of the batch framework, ensuring end-to-end
 * visibility and reliability for CRM data ingestion and transformation repositories.
 *
 * @module framework/batch/services/BatchFileTrackingService
 */
import {MySQLService} from '@platform/connectors';
import {logger} from '@platform/core';
import * as crypto from 'crypto';
import {ConfigProvider} from "@platform/configuration";
import {MySQLRowDataPacket} from '@platform/connectors';
import {AppErrorType, failure, Result, success} from '@platform/core';

/**
 * File status enum
 */
export enum BatchFileStatus {
  DOWNLOADED = 'DOWNLOADED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  FAILED = 'FAILED',
  SYSTEM_UNAVAILABLE = 'SYSTEM_UNAVAILABLE',
  SKIPPED = 'SKIPPED',
  CANCELED = 'CANCELED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
}

/**
 * Tenant status enum
 */
export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',  // Keeping for backward compatibility
  FAILED = 'FAILED',
  PROCESSING = 'PROCESSING',
  COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
  INACTIVE = 'INACTIVE'     // New status for tenants not in use
}

/**
 * Tenant information
 *         `select id, business_id, business_prefix,
 *         crm,
 *         file_format,
 *          total_files_processed,
 *          total_records_processed,
 *
 *          current_folder,
 *          last_processed_at,
 *          last_year,
 *          last_month,
 *          last_day,
 *          status,
 *          locked_at,
 *          locked_by,
 *          last_heartbeat,
 *           created_at, updated_at
 *           from ${this.tenantsTable}`;
 */
export interface TenantInfo {
  id: number;
  businessId: string;
  businessPrefix: string;
  crm: string;
  crmInfo: Record<string, any>;
  fileFormat: 'csv' | 'jsonl';
  totalFilesProcessed?: number;
  totalRecordsProcessed?: number;
  currentFolder?: string;
  lastProcessedAt?: Date;
  lastYear?: number;
  lastMonth?: number;
  lastDay?: number;
  status?: TenantStatus;
  locked_at?: Date;
  locked_by?: string;
  last_heartbeat?: Date;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Database row structure for tenant information
 */
export interface TenantRow {
  id: number;
  business_id: string | number;
  business_prefix: string;
  crm: string;
  crm_info: Record<string, any>;
  file_format: string;
  total_files_processed: number;
  total_records_processed: number;
  current_folder: string | null;
  last_processed_at: Date | null;
  last_year: number | null;
  last_month: number | null;
  last_day: number | null;
  status: string;
  locked_at: Date | null;
  locked_by: string | null;
  last_heartbeat: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * File information
 */
export interface FileInfo {
  businessId: string;
  filePath: string;
  filePrefix?: string; // Optional prefix for file path
  fileName: string;
  fileTimestamp: string;
  fileSize?: number;
  totalRecords?: number;
  processedRecords?: number;
  lastChunk?: string;
  status?: BatchFileStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata?: {
    crmType?: string;
    businessId?: string;
    [key: string]: any;
  };
}

/**
 * Processing history entry
 */
export interface ProcessingHistoryEntry {
  fileId: number;
  chunkIdentifier: string;
  recordsProcessed: number;
  processingTimeMs: number;
}

/**
 * Processing history entry for a file
 */
export interface FileProcessingHistoryEntry {
  chunkIdentifier: string;
  recordsProcessed: number;
  processingTimeMs: number;
}


/**
 * Service for tracking batch file processing
 */
export class BatchFileTrackingService {
  private readonly tenantsTable = 'batch_tenants';
  private readonly filesTable = 'batch_files';
  private readonly historyTable = 'batch_processing_history';
  private readonly dashboardView = 'batch_tenant_dashboard_view';
  private readonly log = logger;

  /**
   * Creates a new BatchFileTrackingService
   * @param mysqlConfig MySQL connection configuration
   */
  constructor() {
    /*
            dataStore: {
                eventStore: "event.events",
                topicRegistry: "event.topic_registry",
                tenantsTable: "event.batch_tenants",
                filesTable: "event.batch_files",
                historyTable: "event.batch_processing_history",
                dashboardView: "event.batch_tenant_dashboard_view"
            },
     */// todo - needs to be updated to use config keys
    this.tenantsTable = ConfigProvider.getRaw('dataStore.tenantsTable');
    this.filesTable = ConfigProvider.getRaw('dataStore.filesTable');
    this.historyTable = ConfigProvider.getRaw('dataStore.historyTable');
    this.dashboardView = ConfigProvider.getRaw('dataStore.dashboardView');
  }

  /**
   * Initialize the database tables
   * @returns True if successful, false otherwise
   */
  async initialize(): Promise<boolean> {

    try {
      // Check if tables exist by querying them
      const result = await MySQLService.select(
          `SHOW TABLES LIKE '${this.tenantsTable}'`,
          [],
          1
      );

      if (!result.success || !result.rows || result.rows.length === 0) {
        this.log.error('Batch tracking tables not found. Please run the SQL initialization script.');
        return false;
      }

      return true;
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize batch tracking service');
      return false;
    }
  }

  /**
   * Register or update a tenant
   * @param tenant Tenant information
   * @returns True if successful, false otherwise
   */
  async registerTenant(tenant: TenantInfo): Promise<boolean> {
    try {
      // Check if tenant exists
      const existingTenant = await this.getTenant(tenant.businessId);

      if (existingTenant) {
        // Update existing tenant
        const result = await MySQLService.modify(
            `UPDATE ${this.tenantsTable} 
           SET crm = ?, file_format = ?, status = ?
           WHERE business_id = ?`,
            [
              tenant.crm,
              tenant.fileFormat,
              tenant.status || TenantStatus.ACTIVE,
              tenant.businessId
            ]
        );

        return result.success;
      } else {
        // Insert new tenant
        const result = await MySQLService.modify(
            `INSERT INTO ${this.tenantsTable}
           (business_id, crm, file_format, status)
           VALUES (?, ?, ?, ?)`,
            [
              tenant.businessId,
              tenant.crm,
              tenant.fileFormat,
              tenant.status || TenantStatus.ACTIVE
            ]
        );

        return result.success;
      }
    } catch (error) {
      this.log.error({ error, tenant }, 'Failed to register tenant');
      return false;
    }
  }

  /**
   * Get tenant information
   * @param businessId Business ID
   * @returns Tenant information or undefined if not found
   */
  async getTenant(businessId: string | number): Promise<TenantInfo | undefined> {
    try {
      const query = `SELECT * FROM ${this.tenantsTable} WHERE business_id = ?`;
      const result = await MySQLService.select(query, [businessId]);

      if (!result.success || !result.rows || result.rows.length === 0) {
        this.log.warn({ businessId }, 'Tenant not found');
        return undefined;
      }

      const row = result.rows[0];
      return this.rowToTenantInfo(row as TenantRow);
    } catch (error) {
      this.log.error({ error, businessId }, 'Failed to get tenant');
      return undefined;
    }
  }

  /**
   * Generate a hash for a file path
   * @param filePath File path to hash
   * @returns SHA-256 hash of the file path
   */
  public generateFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }


  /**
   * Extracts year, month, and day from a file path containing "year=", "month=", and "day=" patterns
   * Example path: exports/gohighlevel/tenant_00995/year=2025/month=06/day=17/2025-06-17_1756/data.jsonl
   *
   * @param filePath The file path to parse
   * @returns Object containing year, month, and day as numbers, or default values if not found
   */
  extractDatePartsFromPath(filePath: string): { year: number, month: number, day: number } {
    // Default values in case we can't extract the date parts
    const defaultDate = { year: new Date().getFullYear(), month: 1, day: 1 };

    try {
      // Use regex to find the patterns
      const yearMatch = filePath.match(/year=(\d{4})/);
      const monthMatch = filePath.match(/month=(\d{2})/);
      const dayMatch = filePath.match(/day=(\d{2})/);

      // Extract the values or use defaults
      const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultDate.year;
      const month = monthMatch ? parseInt(monthMatch[1], 10) : defaultDate.month;
      const day = dayMatch ? parseInt(dayMatch[1], 10) : defaultDate.day;

      return { year, month, day };
    } catch (error) {
      // If any error occurs during parsing, return default values
      logger.warn({ filePath, error }, 'Failed to extract date parts from file path');
      return defaultDate;
    }
  }


  // Add to BatchFileTrackingService class

  /**
   * Get the most recently completed file for a tenant
   * @param businessId The tenant's business ID
   * @returns The most recent completed file or null if none found
   */
  async getLastCompletedFile(businessId: string) : Promise<MySQLRowDataPacket | null> {
    const result = await MySQLService.select(
        `SELECT * FROM ${this.filesTable}
     WHERE business_id = ? AND status = ?
     ORDER BY file_timestamp DESC
     LIMIT 1`,
        [businessId, BatchFileStatus.SUCCESS]
    );

    if (!result.success || !result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as MySQLRowDataPacket;
    return row;
  }

  /**
   * Update a tenant's last processed date
   * @param businessId The tenant's business ID
   * @param year The year component
   * @param month The month component
   * @param day The day component
   */
  async updateTenantLastProcessedDate(businessId: string, year: number, month: number, day: number): Promise<void> {
    await MySQLService.modify(
        `UPDATE ${this.tenantsTable}
     SET last_year = ?, last_month = ?, last_day = ?, last_processed_at = NOW()
     WHERE business_id = ?`,
        [year, month, day, businessId]
    );
  }

  /**
   * Register multiple files for processing in a single database operation
   * @param files Array of file information objects
   * @returns Number of files successfully registered
   */
  async registerFiles(files: FileInfo[]): Promise<number> {
    if (!files.length) {
      return 0;
    }

    try {
      // Prepare values for multi-insert
      const values: any[] = [];
      const placeholders: string[] = [];

      // Process each file
      for (const file of files) {
        const filePathHash = this.generateFilePathHash(file.filePath);

        // parse ymd from file.filePath ===raw/gohighlevel/tenant_00995/year=2025/month=06/day=17/2025-06-17_1756/data.jsonl
        const pathParts = file.filePath.split('/');

        // Add values for this file
        values.push(
            file.businessId,
            file.filePath,
            filePathHash,
            file.fileName,
            file.fileTimestamp,
            file.fileSize || 0,
            file.totalRecords || 0,
            file.status || BatchFileStatus.PENDING
        );

        // Add placeholder for this file
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
      }

      // Execute multi-insert with ON DUPLICATE KEY UPDATE to update existing records
      const result = await MySQLService.modify(
          `INSERT INTO ${this.filesTable}
         (business_id, file_path, file_path_hash, file_name, file_timestamp, file_size, total_records, status)
         VALUES ${placeholders.join(', ')}
         ON DUPLICATE KEY UPDATE 
         total_records = VALUES(total_records),
         file_size = VALUES(file_size),
         status = 'PENDING'`,
          values
      );

      if (!result.success) {
        this.log.error({ result }, 'Failed to register files in batch');
        return 0;
      }

      // Return number of rows affected (files inserted)
      return result.affectedRows || 0;
    } catch (error) {
      this.log.error({ error, fileCount: files.length }, 'Failed to register files in batch');
      return 0;
    }
  }

  /**
   * Register a file for processing
   * @param file File information
   * @param filePathHash The pre-computed hash for the file path
   * @returns File ID if successful, null otherwise
   */
  async registerFile(file: FileInfo, filePathHash: string): Promise<number | null> {
    try {
      // Check if file exists using the provided hash
      const existingFile = await this.getFileByHash(file.businessId, filePathHash);

      if (existingFile) {
        // Return existing file ID
        return existingFile.id;
      }

      // Insert new file
      const result = await MySQLService.modify(
          `INSERT INTO ${this.filesTable}
         (business_id, file_path, file_path_hash, file_name, file_timestamp, file_size, total_records, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            file.businessId,
            file.filePath,
            filePathHash,
            file.fileName,
            file.fileTimestamp,
            file.fileSize || 0,
            file.totalRecords || 0,
            file.status || BatchFileStatus.PENDING
          ]
      );

      if (!result.success || !result.insertId) {
        return null;
      }

      return result.insertId;
    } catch (error) {
      this.log.error({ error, file }, 'Failed to register file');
      return null;
    }
  }

  /**
   * Get file information by hash
   * @param businessId Business ID
   * @param filePathHash File path hash
   * @returns File information with ID or null if not found
   */
  async getFileByHash(businessId: string, filePathHash: string): Promise<(FileInfo & { id: number }) | null> {
    try {
      const result = await MySQLService.select(
          `SELECT * FROM ${this.filesTable} WHERE business_id = ? AND file_path_hash = ?`,
          [businessId, filePathHash],
          1
      );

      if (!result.success || !result.rows || result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        id: row.id,
        businessId: row.business_id,
        filePath: row.file_path,
        fileName: row.file_name,
        fileTimestamp: row.file_timestamp,
        totalRecords: row.total_records,
        processedRecords: row.processed_records,
        lastChunk: row.last_chunk,
        status: row.status as BatchFileStatus,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message,
        fileSize: row.file_size,
        metadata: {
          // Include default metadata values based on the business_id
          businessId: row.business_id,
          // We don't know the CRM type from just the file record,
          // so we'll default to null and let the caller handle it
          crmType: undefined
        }
      };
    } catch (error) {
      this.log.error({ error, businessId, filePathHash }, 'Failed to get file by hash');
      return null;
    }
  }

    /**
     * Get file information
     * @param businessId Business ID
     * @param filePath File path
     * @returns File information with ID or null if not found
     */
    async selectBatchFilesRecord(businessId: string, filePath: string): Promise<(FileInfo & { id: number }) | null> {
        try {
            // Generate hash for file path
            const filePathHash = this.generateFilePathHash(filePath);

            const result = await MySQLService.select(
                `SELECT * FROM ${this.filesTable} WHERE business_id = ? AND file_path_hash = ?`,
                [businessId, filePathHash],
                1
            );

            if (!result.success || !result.rows || result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];

            return {
                id: row.id,
                businessId: row.business_id,
                filePath: row.file_path,
                fileName: row.file_name,
                fileTimestamp: row.file_timestamp,
                totalRecords: row.total_records,
                processedRecords: row.processed_records,
                lastChunk: row.last_chunk,
                status: row.status as BatchFileStatus,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                errorMessage: row.error_message,
                fileSize: row.file_size
            };
        } catch (error) {
            this.log.error({ error, businessId, filePath }, 'Failed to get file');
            return null;
        }
    }

  /**
   * Get file by ID
   * @param fileId File ID
   * @returns File information or null if not found
   */
  async getFileById(fileId: number): Promise<(FileInfo & { id: number }) | null> {
    try {
      this.log.debug({ fileId }, 'Getting file by ID');
      
      const result = await MySQLService.select(
        `SELECT * FROM ${this.filesTable} WHERE id = ?`,
        [fileId],
        1
      );
      
      if (!result.success || !result.rows || result.rows.length === 0) {
        this.log.debug({ fileId }, 'File not found');
        return null;
      }
      
      const row = result.rows[0];
      
      const file: FileInfo & { id: number } = {
        id: row.id,
        businessId: row.business_id,
        filePath: row.file_path,
        filePrefix: row.file_prefix,
        fileName: row.file_name,
        fileTimestamp: row.file_timestamp,
        fileSize: row.file_size,
        totalRecords: row.total_records,
        processedRecords: row.processed_records,
        lastChunk: row.last_chunk,
        status: row.status as BatchFileStatus,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message
      };
      
      this.log.debug({ fileId, file }, 'File found');
      return file;
    } catch (error) {
      this.log.error({ error, fileId }, 'Failed to get file by ID');
      return null;
    }
  }

  /**
   * Update file processing status
   * @param fileId File ID
   * @param status New file status
   * @param details Optional additional details about the file processing
   * @returns True if successful, false otherwise
   */
  async updateFileStatus(
      fileId: number,
      status: BatchFileStatus,
      details?: {
        totalRecords?: number;
        processedRecords?: number;
        successfulRecords?: number;
        recordsFailed?: number;
        retryableErrors?: number;
        nonRetryableErrors?: number;
        lastChunk?: string;
        errorMessage?: string;
        errorFilePath?: string;
      }
  ): Promise<boolean> {
    try {
      const updateFields: string[] = ['status = ?'];
      const updateValues: any[] = [status];

      if (details) {
        if (details.totalRecords !== undefined) {
          updateFields.push('total_records = ?');
          updateValues.push(details.totalRecords);
        }

        if (details.processedRecords !== undefined) {
          updateFields.push('processed_records = ?');
          updateValues.push(details.processedRecords);
        }
        
        if (details.successfulRecords !== undefined) {
          updateFields.push('successful_records = ?');
          updateValues.push(details.successfulRecords);
        }

        if (details.recordsFailed !== undefined) {
          updateFields.push('failed_records = ?');
          updateValues.push(details.recordsFailed);
        }

        if (details.retryableErrors !== undefined) {
          updateFields.push('retryable_errors = ?');
          updateValues.push(details.retryableErrors);
        }

        if (details.nonRetryableErrors !== undefined) {
          updateFields.push('non_retryable_errors = ?');
          updateValues.push(details.nonRetryableErrors);
        }

        if (details.lastChunk !== undefined) {
          updateFields.push('last_chunk = ?');
          updateValues.push(details.lastChunk);
        }

        if (details.errorMessage !== undefined) {
          updateFields.push('error_message = ?');
          updateValues.push(details.errorMessage);
        }

        if (details.errorFilePath !== undefined) {
          updateFields.push('error_file_path = ?');
          updateValues.push(details.errorFilePath);
        }

        if (status === BatchFileStatus.PROCESSING) {
          updateFields.push('started_at = CURRENT_TIMESTAMP');
        } else if ([BatchFileStatus.SUCCESS, BatchFileStatus.PARTIAL_SUCCESS, BatchFileStatus.FAILED, BatchFileStatus.SYSTEM_UNAVAILABLE].includes(status)) {
          updateFields.push('completed_at = CURRENT_TIMESTAMP');
        }
      }

      // Add file ID to values
      updateValues.push(fileId);

      const query = `
        UPDATE ${this.filesTable}
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      const result = await MySQLService.modify(query, updateValues);
      return result.affectedRows > 0;
    } catch (error) {
      this.log.error({ error, fileId }, 'Failed to update file status');
      return false;
    }
  }

  /**
   * Update file processing status by business ID and file path
   * @param businessId Business ID
   * @param filePath File path
   * @param update Update information
   * @returns True if successful, false otherwise
   */
  async updateFileStatusByPath(
      businessId: string,
      filePath: string,
      update: {
        status: BatchFileStatus;
        totalRecords?: number;
        processedRecords?: number;
        successfulRecords?: number;
        recordsFailed?: number;
        retryableErrors?: number;
        nonRetryableErrors?: number;
        lastChunk?: string;
        errorMessage?: string;
        errorFilePath?: string;
      }
  ): Promise<boolean> {
    try {
      // Get the file ID first
      const file = await this.selectBatchFilesRecord(businessId, filePath);
      if (!file) {
        this.log.warn({ businessId, filePath }, 'File not found for status update');
        return false;
      }

      // Update using the file ID
      return this.updateFileStatus(file.id, update.status, {
        totalRecords: update.totalRecords,
        processedRecords: update.processedRecords,
        successfulRecords: update.successfulRecords,
        recordsFailed: update.recordsFailed,
        retryableErrors: update.retryableErrors,
        nonRetryableErrors: update.nonRetryableErrors,
        lastChunk: update.lastChunk,
        errorMessage: update.errorMessage,
        errorFilePath: update.errorFilePath
      });
    } catch (error) {
      this.log.error({ error, businessId, filePath }, 'Failed to update file status by path');
      return false;
    }
  }

  /**
   * Update tenant statistics
   * @param businessId Business ID
   * @returns True if successful, false otherwise
   */
  async updateTenantStatistics(businessId: string): Promise<boolean> {
    try {
      // Get file statistics
      const result = await MySQLService.select(
          `SELECT 
           COUNT(*) AS total_files,
           SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS completed_files,
           SUM(CASE WHEN status = 'SUCCESS' THEN total_records ELSE 0 END) AS total_records_processed
         FROM ${this.filesTable}
         WHERE business_id = ?`,
          [businessId],
          1
      );

      if (!result.success || !result.rows || result.rows.length === 0) {
        return false;
      }

      const stats = result.rows[0];

      // Update tenant statistics
      const updateResult = await MySQLService.modify(
          `UPDATE ${this.tenantsTable}
         SET 
           total_files_processed = ?,
           total_records_processed = ?,
           last_processed_at = CURRENT_TIMESTAMP
         WHERE business_id = ?`,
          [
            stats.completed_files || 0,
            stats.total_records_processed || 0,
            businessId
          ]
      );

      return updateResult.success;
    } catch (error) {
      this.log.error({ error, businessId }, 'Failed to update tenant statistics');
      return false;
    }
  }

  /**
   * Add processing history entry
   * @param entry Processing history entry
   * @returns True if successful, false otherwise
   */
  async addProcessingHistory(entry: ProcessingHistoryEntry): Promise<boolean> {
    try {
      const result = await MySQLService.modify(
          `INSERT INTO ${this.historyTable}
         (file_id, chunk_identifier, records_processed, processing_time_ms)
         VALUES (?, ?, ?, ?)`,
          [
            entry.fileId,
            entry.chunkIdentifier,
            entry.recordsProcessed,
            entry.processingTimeMs
          ]
      );

      return result.success;
    } catch (error) {
      this.log.error({ error, entry }, 'Failed to add processing history');
      return false;
    }
  }

  /**
   * Add processing history entry for a file
   * @param businessId Business ID
   * @param filePath File path
   * @param entry Processing history entry
   * @returns True if successful, false otherwise
   */
  async addProcessingHistoryEntry(
      businessId: string,
      filePath: string,
      entry: FileProcessingHistoryEntry
  ): Promise<boolean> {
    try {
      // Get file ID
      const fileInfo = await this.selectBatchFilesRecord(businessId, filePath);

      if (!fileInfo) {
        this.log.error({ businessId, filePath }, 'Cannot add processing history: File not found');
        return false;
      }

      // Add processing history entry
      const result = await this.addProcessingHistory({
        fileId: fileInfo.id,
        chunkIdentifier: entry.chunkIdentifier,
        recordsProcessed: entry.recordsProcessed,
        processingTimeMs: entry.processingTimeMs
      });

      return result;
    } catch (error) {
      this.log.error({ error, businessId, filePath }, 'Failed to add processing history entry');
      return false;
    }
  }

  /**
   * Update processing history entry with processing time
   * @param update Update information
   * @returns True if successful, false otherwise
   */
  async updateProcessingHistory(update: {
    fileId: number;
    chunkIdentifier: string;
    processingTimeMs: number;
  }): Promise<boolean> {
    try {
      const result = await MySQLService.modify(
          `UPDATE ${this.historyTable}
         SET processing_time_ms = ?
         WHERE file_id = ? AND chunk_identifier = ?`,
          [update.processingTimeMs, update.fileId, update.chunkIdentifier]
      );

      return result.success;
    } catch (error) {
      this.log.error({ error, update }, 'Failed to update processing history');
      return false;
    }
  }


  /**
   * List files for a tenant with optional filtering
   * @param businessId Business ID
   * @param status Optional status filter or array of statuses
   * @param orderBy Optional order by clause (e.g., 'file_timestamp ASC')
   * @returns Array of file information
   */
  async selectFiles(businessId: string, status?: BatchFileStatus | BatchFileStatus[], orderBy?: string): Promise<(FileInfo & { id: number })[]> {
    try {
      let query = `select F.id,
          F.business_id,
          T.business_prefix,
          T.file_format,
          F.file_path,
          F.file_path_hash,
          F.file_name,
          F.file_size,
          F.file_timestamp,
          F.total_records,
          F.processed_records,
          F.last_chunk,
          F.status,
          F.started_at,
          F.completed_at,
          F.error_message,
          F.created_at,
          F.updated_at
      FROM ${this.filesTable} F
      JOIN ${this.tenantsTable} T ON (F.business_id = T.business_id)
      WHERE F.business_id = ?`;
      const params: any[] = [businessId];

      if (status) {
        if (Array.isArray(status)) {
          if (status.length > 0) {
            query += ` AND F.status IN (${status.map(() => '?').join(',')})`;
            params.push(...status);
          }
        } else {
          query += ' AND status = ?';
          params.push(status);
        }
      }

      query += ` ORDER BY ${orderBy || 'file_timestamp DESC'}`;

      const result = await MySQLService.select(
          query,
          params,
          1
      );

      if (!result.success || !result.rows) {
        return [];
      }

      return result.rows.map(row => ({
        id: row.id,
        businessId: row.business_id,
        businessPrefix: row.business_prefix,
        fileFormat: row.file_format as 'csv' | 'jsonl',
        filePath: row.file_path,
        fileName: row.file_name,
        fileTimestamp: row.file_timestamp,
        totalRecords: row.total_records,
        processedRecords: row.processed_records,
        lastChunk: row.last_chunk,
        status: row.status as BatchFileStatus,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message,
        fileSize: row.file_size
      }));
    } catch (error) {
      this.log.error({ error, businessId }, 'Failed to list files');
      return [];
    }
  }

  /**
   * List all tenants
   * @returns Array of TenantInfo
   */
  async listTenants(): Promise<TenantInfo[]> {
    const query = `SELECT * FROM ${this.tenantsTable}`;
    const result = await MySQLService.select(query);
    
    if (!result.success || !result.rows) {
      this.log.error('Failed to list tenants');
      return [];
    }
    
    return this.rowsToTenantInfoArray(result.rows as TenantRow[]);
  }


  /**
   * List all tenants
   * @returns Array of TenantInfo
   */
  async listTenantsByCRM(crm: string): Promise<Result<TenantInfo[]>> {
    const query = `select T.id, T.business_id, T.business_prefix, T.crm, T.file_format, T.status
                   from ${this.tenantsTable} T 
                   where T.crm = ?`;
    const result = await MySQLService.select<any>(query, [crm]);
    if (!result.success || result.rowCount === 0  ) {
      this.log.error('Failed to list tenants');
      return failure({
          message: "Found no tenants",
          type: AppErrorType.NOT_FOUND,
          context: {
              operation: 'listTenantsByCRM',
              code: query
          }

      });
    }
    else if (!result.rows || result.rows?.length === 0) {
      this.log.error('Failed to list tenants');
      return failure({
          message: "Found no tenants",
          type: AppErrorType.NOT_FOUND,
          context: {
              operation: 'listTenantsByCRM',
              code: query
          }

      });
    }

    // Map DB rows to TenantInfo objects
    return success(this.rowsToTenantInfoArray(result.rows));
  }


  /**
   * Try to claim a tenant for processing
   * @param workerId Unique identifier for the worker
   * @param lockTimeoutMinutes Minutes after which a lock is considered stale
   * @returns The claimed tenant or null if no tenant is available
   */
  async claimTenantForProcessing(workerId: string, lockTimeoutMinutes = 60): Promise<TenantInfo | null> {
    try {
      // First, let's check if there are any tenants with PENDING files
      const pendingFilesQuery = `
        SELECT DISTINCT t.business_id, t.status, t.locked_at, t.locked_by, 
               COUNT(f.id) as pending_files
        FROM ${this.tenantsTable} t
        JOIN ${this.filesTable} f ON t.business_id = f.business_id
        WHERE f.status = ? or f.status = ?
        GROUP BY t.business_id
      `;

      const pendingFilesResult = await MySQLService.select(pendingFilesQuery, [BatchFileStatus.PENDING, BatchFileStatus.DOWNLOADED]);
      logger.info({ pendingFiles: pendingFilesResult.success ? pendingFilesResult.rows : [] }, 'Tenants with pending files');
      
      // Now check for locked tenants
      const lockedTenantsQuery = `
        SELECT business_id, status, locked_at, locked_by, last_heartbeat
        FROM ${this.tenantsTable}
        WHERE locked_at IS NOT NULL
      `;
      
      const lockedTenantsResult = await MySQLService.select(lockedTenantsQuery);
      logger.info({ lockedTenants: lockedTenantsResult.success ? lockedTenantsResult.rows : [] }, 'Currently locked tenants');

      // If lockTimeoutMinutes is 0, release any existing locks first
      if (lockTimeoutMinutes === 0) {
        logger.info('Lock timeout is 0, releasing any existing locks');
        await this.releaseStaleTenantsLocks(0);
      }

      // Find eligible tenants with pending work (no transaction/locking)
      const eligibleTenantsQuery = `
        SELECT t.* 
        FROM ${this.tenantsTable} t
        WHERE t.business_id IN (
          SELECT DISTINCT business_id 
          FROM ${this.filesTable} 
          WHERE status = ? or status = ?
        )
        AND (t.locked_at IS NULL OR t.locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
        AND t.status != ?
        ORDER BY t.last_processed_at ASC
        LIMIT 5
      `;

      const eligibleTenantsResult = await MySQLService.select(eligibleTenantsQuery, 
        [BatchFileStatus.PENDING, BatchFileStatus.DOWNLOADED, lockTimeoutMinutes, TenantStatus.PAUSED]);

        if (!eligibleTenantsResult.success || eligibleTenantsResult.rowCount === 0  ) {
            logger.info('No eligible tenants found for processing');
            return null;
        }
      else if (!eligibleTenantsResult.rows || eligibleTenantsResult.rows?.length === 0) {
        logger.info('No eligible tenants found for processing');
        return null;
      }

      // Try to claim each tenant until one succeeds
      for (const tenant of eligibleTenantsResult.rows) {
        // Use optimistic concurrency - try to update only if conditions still match
        const updateQuery = `
            UPDATE ${this.tenantsTable}
            SET locked_at      = NOW(),
                locked_by      = ?,
                last_heartbeat = NOW(),
                status         = ?
            WHERE business_id = ?
              AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
              AND status != ?
        `;

        const updateResult = await MySQLService.modify(updateQuery, 
          [workerId, TenantStatus.PROCESSING, tenant.business_id, lockTimeoutMinutes, TenantStatus.PAUSED]);

        if (updateResult.affectedRows === 1) {
          // Successfully claimed the tenant
          logger.info({ businessId: tenant.business_id }, 'Successfully claimed tenant for processing');
          
          // Get the updated tenant info
          const tenantRowsResult = await MySQLService.select(`
            SELECT * FROM ${this.tenantsTable}
            WHERE business_id = ?
          `, [tenant.business_id]);

          if (!tenantRowsResult.success || tenantRowsResult.rowCount === 0) {
            logger.warn({ businessId: tenant.business_id }, 'Tenant disappeared after claiming');
            continue;
          } else if (!tenantRowsResult.rows || tenantRowsResult.rows.length === 0) {
            logger.info({ businessId: tenant.business_id }, 'Tenant successfully claimed for processing');
            continue
          }

          return this.rowToTenantInfo(tenantRowsResult.rows[0] as TenantRow);
        }
      }

      logger.info('Could not claim any tenant for processing');
      return null;
    } catch (error) {
      logger.error({ error }, 'Error claiming tenant for processing');
      return null;
    }
  }

  /**
   * Update the heartbeat for a tenant to indicate the worker is still processing it
   * @param businessId Business ID of the tenant
   * @param workerId Worker ID that has the lock
   * @returns True if the heartbeat was updated successfully
   */
  async updateTenantHeartbeat(businessId: string, workerId: string): Promise<boolean> {
    try {
      const result = await MySQLService.modify(`
        UPDATE ${this.tenantsTable}
        SET last_heartbeat = NOW()
        WHERE business_id = ?
        AND locked_by = ?
      `, [businessId, workerId]);

      return result.success && result.affectedRows > 0;
    } catch (error) {
      this.log.error({ error, businessId }, 'Failed to update tenant heartbeat');
      return false;
    }
  }

  /**
   * Release a tenant lock
   * @param businessId Business ID of the tenant
   * @param workerId Worker ID that has the lock
   * @param status New status for the tenant (defaults to ACTIVE)
   * @returns True if the tenant was released successfully
   */
  async releaseTenant(businessId: string, workerId: string, status: TenantStatus = TenantStatus.ACTIVE): Promise<boolean> {
    try {
      const result = await MySQLService.modify(`
        UPDATE ${this.tenantsTable}
        SET locked_at = NULL,
            locked_by = NULL,
            status = ?
        WHERE business_id = ?
        AND locked_by = ?
      `, [status, businessId, workerId]);

      return result.success && result.affectedRows > 0;
    } catch (error) {
      this.log.error({ error, businessId }, 'Failed to release tenant');
      return false;
    }
  }

  /**
   * Check if there are any stale tenant locks and release them
   * @param lockTimeoutMinutes Minutes after which a lock is considered stale (0 to release all locks)
   * @returns Number of released locks
   */
  async releaseStaleTenantsLocks(lockTimeoutMinutes = 60): Promise<number> {
    try {
      let query = `
        UPDATE ${this.tenantsTable}
        SET locked_at = NULL,
            locked_by = NULL,
            status = ?
        WHERE locked_at IS NOT NULL
      `;

        const params: (TenantStatus | number)[] = [TenantStatus.ACTIVE];
      
      // If lockTimeoutMinutes > 0, only release locks that have timed out
      if (lockTimeoutMinutes > 0) {
        query += ` AND last_heartbeat < DATE_SUB(NOW(), INTERVAL ? MINUTE)`;
        params.push(lockTimeoutMinutes);
      }
      
      const result = await MySQLService.modify(query, params);
      
      const releasedCount = result.success ? result.affectedRows : 0;
      if (releasedCount > 0) {
        this.log.info({ releasedCount }, `Released ${releasedCount} stale tenant locks`);
      }

      return releasedCount;
    } catch (error) {
      this.log.error({ error }, 'Failed to release stale tenant locks');
      return 0;
    }
  }

  private rowsToTenantInfoArray(rows: TenantRow[]): TenantInfo[] {
    return rows.map((row: any) => (
      this.rowToTenantInfo(row)))
  }

  private rowToTenantInfo(row: TenantRow): TenantInfo {
    return {
      id: row.id,
      businessId: String(row.business_id),
      businessPrefix: row.business_prefix,
      crm: row.crm,
      crmInfo: row.crm_info,
      fileFormat: row.file_format as 'csv' | 'jsonl',
      totalFilesProcessed: row.total_files_processed,
      totalRecordsProcessed: row.total_records_processed,
      lastProcessedAt: row.last_processed_at || undefined,
      status: row.status as TenantStatus,
      lastYear: row.last_year || undefined,
      lastMonth: row.last_month || undefined,
      lastDay: row.last_day || undefined,
      locked_at: row.locked_at || undefined,
      locked_by: row.locked_by || undefined,
      last_heartbeat: row.last_heartbeat || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
  /**
   * Debug method to check for files with PENDING status
   * @returns Array of files with PENDING status
   */
  async checkPendingFiles(): Promise<any> {
    const query = `
      SELECT f.id, f.business_id, f.file_path, f.status, t.status as tenant_status, 
             t.locked_at, t.locked_by
      FROM ${this.filesTable} f
      JOIN ${this.tenantsTable} t ON f.business_id = t.business_id
      WHERE f.status = ?
    `;
    
    const result = await MySQLService.select(query, [BatchFileStatus.PENDING]);
    return result.success ? result.rows : [];
  }

  /**
   * Execute a raw SQL query - for utility functions only
   * @param query SQL query to execute
   * @param params Query parameters
   * @returns Query result
   */
  async executeQuery(query: string, params: any[] = []): Promise<any> {
    try {
      if (query.toLowerCase().trim().startsWith('select')) {
        return await MySQLService.select(query, params);
      } else {
        return await MySQLService.modify(query, params);
      }
    } catch (error) {
      this.log.error({ error, query }, 'Failed to execute query');
      return { success: false, error };
    }
  }
}
