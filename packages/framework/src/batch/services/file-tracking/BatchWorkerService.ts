/**
 * BatchWorkerService.ts - Batch Worker Service
 *
 * This file defines the BatchWorkerService class and related types for processing batch files for tenants.
 * It manages the workflow for reading, processing, and tracking files and records in the batch framework.
 *
 * What does this file do?
 * - Orchestrates batch file processing for tenants
 * - Handles file reading, processing, and status updates
 * - Tracks processing summaries and errors
 *
 * How do you use it?
 * - Instantiate and use BatchWorkerService in your batch job
 * - Extend or modify logic to support new processing requirements
 *
 * Why is this important?
 * - Centralizes batch processing logic for maintainability
 * - Helps new developers understand the processing workflow
 *
 * @module common/framework/batch/services/BatchWorkerService
 */
import {logger} from '@platform/core';
import {BatchFileTrackingService, BatchFileStatus, TenantInfo, TenantStatus} from './BatchFileTrackingService';
import {S3Service} from '@platform/services';
import {ConfigProvider} from '@platform/configuration';
import {FileProcessorService} from './FileProcessorService';
import {v4 as uuidv4} from 'uuid';
import * as os from 'os';
import {createError, failure, isSuccess, Result, success} from '@platform/core';
import {BatchProcessor} from "../../models";
import {CONFIG} from "@platform/configuration";


/**
 * Processing summary for a tenant
 */
export interface TenantProcessingSummary {
  businessId: string;
  filesProcessed: number;
  recordsProcessed: number;
  failedFiles: number;
  status: TenantStatus;
}

/**
 * Worker configuration
 */
export interface BatchWorkerConfig {
  workerId?: string;
  heartbeatIntervalMs?: number;
  lockTimeoutMinutes?: number;
  s3Bucket?: string;
  s3Prefix?: string;
}

/**
 * Service for batch file processing workers
 * Handles tenant claiming, file processing, and worker coordination
 */
export class BatchWorkerService {
  private readonly workerId: string;
  private readonly heartbeatIntervalMs: number;
  private readonly lockTimeoutMinutes: number;
  private readonly s3Bucket: string;
  private readonly s3Prefix: string;
  private heartbeatInterval?: NodeJS.Timeout;
  private activeTenants: Set<string> = new Set();
  private readonly log = logger;
  private readonly fileProcessor: FileProcessorService;

  /**
   * Creates a new BatchWorkerService
   * @param batchService The batch file tracking service
   * @param s3Service The S3 service (not used directly, using static methods instead)
   * @param config Worker configuration
   */
  constructor(
    private readonly batchService: BatchFileTrackingService,
    private readonly s3Service: S3Service,
    config?: BatchWorkerConfig
  ) {
    this.workerId = config?.workerId || `${os.hostname()}-${process.pid}-${uuidv4().substring(0, 8)}`;
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs || 30000; // 30 seconds
    this.lockTimeoutMinutes = config?.lockTimeoutMinutes || 10; // 10 minutes default
    this.s3Bucket = config?.s3Bucket || ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_BUCKET, 'crmdata');
    this.s3Prefix = config?.s3Prefix || ConfigProvider.get(CONFIG.BATCH_S3_EXPORT_PREFIX, 'exports');

    // Initialize file processor with the same S3Service instance
    this.fileProcessor = new FileProcessorService(batchService, s3Service, {
      s3Bucket: this.s3Bucket,
      s3Prefix: this.s3Prefix
    });

    this.log.info({ 
      workerId: this.workerId,
      lockTimeoutMinutes: this.lockTimeoutMinutes,
      heartbeatIntervalMs: this.heartbeatIntervalMs
    }, 'BatchWorkerService initialized');
  }

  /**
   * Start the worker heartbeat
   */
  public startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      for (const tenantId of this.activeTenants) {
        await this.batchService.updateTenantHeartbeat(tenantId, this.workerId);
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop the worker heartbeat
   */
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Claim a tenant for processing
   * @returns The claimed tenant or null if no tenant is available
   */
  public async claimTenant(): Promise<TenantInfo | null> {
    const tenant = await this.batchService.claimTenantForProcessing(this.workerId, this.lockTimeoutMinutes);

    if (tenant) {
      this.log.info({ tenantId: tenant.businessId }, 'Tenant claimed for processing');
      this.activeTenants.add(tenant.businessId);
    }

    return tenant;
  }

  /**
   * Release a tenant after processing
   * @param tenant The tenant to release
   * @param status The status to set for the tenant
   */
  public async releaseTenant(tenant: TenantInfo, status: TenantStatus = TenantStatus.ACTIVE): Promise<boolean> {
    const result = await this.batchService.releaseTenant(tenant.businessId, this.workerId, status);

    if (result) {
      this.log.info({ tenantId: tenant.businessId, status }, 'Tenant released');
      this.activeTenants.delete(tenant.businessId);
    }

    return result;
  }

  /**
   * Process all pending files for a tenant
   * @param tenant The tenant to process
   * @param processor Optional processor to use for processing files
   * @returns A summary of the processing results
   */
  public async processTenant(tenant: TenantInfo, processor: BatchProcessor<any>): Promise<Result<TenantProcessingSummary>> {
    try {
      this.log.info({ tenantId: tenant.businessId }, 'Starting tenant file processing');

      // Get all files ready for processing for this tenant (both PENDING and DOWNLOADED)
      const filesToProcess = await this.batchService.selectFiles(
        tenant.businessId,
        [BatchFileStatus.PENDING, BatchFileStatus.DOWNLOADED],
        'file_timestamp ASC'
      );

      if (filesToProcess.length === 0) {
        this.log.info({ tenantId: tenant.businessId }, 'No files found for processing');
        return success({
          businessId: tenant.businessId,
          filesProcessed: 0,
          recordsProcessed: 0,
          failedFiles: 0,
          status: TenantStatus.ACTIVE
        });
      }

      // Process each file
      let filesProcessed = 0;
      let recordsProcessed = 0;
      let failedFiles = 0;

      for (const file of filesToProcess) {
        try {
          // Update file status to IN_PROGRESS
          await this.batchService.updateFileStatus(file.id, BatchFileStatus.PROCESSING);

          // Process the file using the FileProcessorService
          const result = await this.fileProcessor.processFile(file, tenant.businessId, processor);

          if (isSuccess(result)) {
            // Update file status to COMPLETED
            await this.batchService.updateFileStatus(file.id, BatchFileStatus.SUCCESS, {
              processedRecords: result.data.recordsProcessed,
              totalRecords: result.data.recordsProcessed,
              recordsFailed: result.data.recordsFailed
            });

            filesProcessed++;
            recordsProcessed += result.data.recordsProcessed;
          } else {
            failedFiles++;
            this.log.error(
              { tenantId: tenant.businessId, filePath: file.filePath, error: result.error },
              'Failed to process file'
            );
          }
        } catch (error) {
          failedFiles++;
          this.log.error(
            { tenantId: tenant.businessId, filePath: file.filePath, error },
            'Exception while processing file'
          );
        }
      }

      // Determine final status based on processing results
      let finalStatus = TenantStatus.ACTIVE;
      if (failedFiles > 0 && failedFiles === filesToProcess.length) {
        finalStatus = TenantStatus.FAILED;
      } else if (failedFiles > 0) {
        finalStatus = TenantStatus.COMPLETED_WITH_ERRORS;
      }

      const summary = {
        businessId: tenant.businessId,
        filesProcessed,
        recordsProcessed,
        failedFiles,
        status: finalStatus
      };

      this.log.info({ summary }, 'Tenant processing completed');
      return success(summary);
    } catch (error) {
      this.log.error({ error, tenantId: tenant.businessId }, 'Tenant processing failed');

      return failure(createError({
        name: 'TenantProcessingError',
        message: `Failed to process tenant ${tenant.businessId}: ${error instanceof Error ? error.message : String(error)}`,
        type: 'PROCESSING_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }
}
