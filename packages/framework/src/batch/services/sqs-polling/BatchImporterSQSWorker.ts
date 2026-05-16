/**
 * BatchImporterSQSWorker.ts
 * 
 * SQS-based worker for batch importers that extends the BaseSQSWorkerService
 * with batch importer specific functionality.
 */
import {BaseSQSWorkerConfig, BaseSQSWorkerService, MessageProcessor} from './BaseSQSWorkerService';
import {BatchFileTrackingService, TenantInfo} from '../file-tracking/BatchFileTrackingService';
import {S3Service} from '@platform/services';
import {logger} from '@platform/core';
import {AppErrorType, Result, ResultError} from '@platform/core';

/**
 * Configuration for the BatchImporterSQSWorker
 */
export interface BatchImporterSQSWorkerConfig extends BaseSQSWorkerConfig {
  s3Bucket: string;
  s3Prefix: string;
}

/**
 * Interface for CRM adapters used by the batch importer
 */
export interface CRMImporterAdapter {
  name: string;
  downloadTenantData(tenant: TenantInfo): Promise<Result<any>>;
}

/**
 * Message processor for batch importer SQS messages
 */
export class BatchImporterMessageProcessor implements MessageProcessor {

  /**
   * Creates a new BatchImporterMessageProcessor
   * @param batchService Batch file tracking service
   * @param s3Service S3 service
   * @param s3Bucket S3 bucket name
   * @param s3Prefix S3 prefix
   * @param adapterRegistry CRM adapter registry
   */
  constructor(
    private readonly batchService: BatchFileTrackingService,
    private readonly s3Service: S3Service,
    private readonly s3Bucket: string,
    private readonly s3Prefix: string,
    private readonly adapterRegistry: CRMAdapterRegistry
  ) {

  }

  /**
   * Initialize the processor
   */
  async initialize(): Promise<boolean> {
    try {
      // Initialize batch service
      await this.batchService.initialize();
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize BatchImporterMessageProcessor');
      return false;
    }
  }

  /**
   * Process a message
   * @param message Message to process
   */
  async processMessage(message: any): Promise<{ success: boolean; error?: ResultError }> {
    try {
      // Parse message body
      const body = JSON.parse(message.Body || '{}');
      const crmType = body.crmType;
      const tenant = body.tenant;


      if (!crmType || !tenant) {
        return { 
          success: false, 
          error: { 
            message: 'Invalid message format: missing crmType or tenant',
            type: AppErrorType.INVALID_MESSAGE_FORMAT,
            retryable: false
          } 
        };
      }
      
      logger.info({ crmType, tenantId: tenant.businessId }, 'Processing batch import request');
      
      // Get adapter for CRM type
      const adapter = this.adapterRegistry.getAdapter(crmType);
      if (!adapter) {
        return { 
          success: false, 
          error: { 
            message: `No adapter found for CRM type: ${crmType}`,
            type: AppErrorType.CONFIGURATION_ERROR,
            retryable: false
          } 
        };
      }
      
      // Process tenant with adapter
      const result = await adapter.downloadTenantData(tenant);
      
      if (!result.success) {
        const errorDetails: ResultError = {
          message: `Error downloading tenant data: ${result.error?.message || 'Unknown error'}`,
          type: AppErrorType.DOWNLOAD_ERROR,
          cause: result.error,

          retryable: true // Default to retryable
        };
        
        return { 
          success: false, 
          error: errorDetails
        };
      }
      
      return { success: true };
    } catch (error: any) {
      logger.error({ error }, 'Error processing batch import message');
      return { 
        success: false, 
        error: { 
          message: `Error processing message: ${error.message}`,
          type: AppErrorType.INTERNAL_ERROR,
          retryable: true
        } 
      };
    }
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    // No specific shutdown actions needed
  }
}

/**
 * Registry for CRM adapters
 */
export class CRMAdapterRegistry {
  private adapters: Map<string, CRMImporterAdapter> = new Map();
  
  /**
   * Register a CRM adapter
   * @param adapter CRM adapter to register
   */
  register(adapter: CRMImporterAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
    logger.info({ adapterName: adapter.name }, 'Registered CRM adapter');
  }
  
  /**
   * Get a CRM adapter by type
   * @param crmType CRM type
   * @returns CRM adapter or undefined if not found
   */
  getAdapter(crmType: string): CRMImporterAdapter | undefined {
    return this.adapters.get(crmType.toLowerCase());
  }
  
  /**
   * Get all registered CRM adapters
   * @returns Array of CRM adapters
   */
  getAllAdapters(): CRMImporterAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  /**
   * Get all supported CRM types
   * @returns Array of supported CRM types
   */
  getSupportedCrmTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * SQS-based worker for batch importers
 */
export class BatchImporterSQSWorker extends BaseSQSWorkerService {
  private batchService: BatchFileTrackingService;
  private s3Service: S3Service;
  private adapterRegistry: CRMAdapterRegistry;

  /**
   * Creates a new BatchImporterSQSWorker
   * @param config Worker configuration
   * @param adapterRegistry
   */
  constructor(
    config: BatchImporterSQSWorkerConfig,
    adapterRegistry: CRMAdapterRegistry
  ) {
    super(config);
    
    // Initialize services
    this.batchService = new BatchFileTrackingService();
    this.s3Service = new S3Service();
    this.adapterRegistry = adapterRegistry;
    
    logger.info({
      supportedCrmTypes: this.adapterRegistry.getSupportedCrmTypes()
    }, 'BatchImporterSQSWorker initialized');
  }

  /**
   * Create a message processor for the SQS subscriber
   */
  protected async createMessageProcessor(): Promise<MessageProcessor> {
    return new BatchImporterMessageProcessor(
      this.batchService,
      this.s3Service,
      (this.config as BatchImporterSQSWorkerConfig).s3Bucket,
      (this.config as BatchImporterSQSWorkerConfig).s3Prefix,
      this.adapterRegistry
    );
  }
}
