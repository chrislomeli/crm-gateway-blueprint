/**
 * OpenSearchService - Elasticsearch/OpenSearch Integration
 *
 * This service provides a high-level interface for interacting with Elasticsearch or OpenSearch clusters
 * in Blueprint applications. It wraps the official client, adds robust error handling, retry logic, and
 * exposes methods for search, index, bulk, and health check operations.
 *
 * Key features:
 * - Unified interface for Elasticsearch and OpenSearch
 * - Comprehensive error handling using the Result pattern
 * - Retry logic for transient errors
 * - Supports search, index, delete, and bulk operations
 * - Integrates with Blueprint observability and configuration systems
 *
 * This service is used by ingestion pipelines, batch processors, and connectors that require
 * reliable, observable, and maintainable search backend access.
 *
 * @module infrastructure/datastores/elasticsearch/OpenSearchService
 */
//import { Client } from '@elastic/elasticsearch';
import * as crypto from 'crypto';
import {Result, success, failure, createError, getErrorInfo, AppErrorType} from '@platform/core';
import { logger } from '@platform/core';
import {CONFIG, ConfigProvider} from '@platform/configuration';
import { 
  SearchQueryResult, 
  OpenSearchIndexResult, 
  OpenSearchOperationResult 
} from './opensearch-types';



import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';


import {
  AwsCredentialIdentity,
  AwsCredentialIdentityProvider,
} from '@smithy/types';
// import 'source-map-support/register';


interface OpenSearchConfig {
  accessKeyId: string;
  accessKeySecret: string;
  esHost: string;
  esRegion?: string;
  tenantIsolationLevel?: 'tenant' | 'crm' | 'none';
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}


export const credentialFromKeys = (
    accessKeyId: string,
    secretAccessKey: string,
): AwsCredentialIdentityProvider => {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (): Promise<AwsCredentialIdentity> => {
    return {
      accessKeyId,
      secretAccessKey,
      // sessionToken: 'optional-session-token'
    };
  };
};


interface OpensearchGetResponse<T> { _id: string; _source: T; found: boolean; _version?: number, [key: string]: unknown }


/**
 * OpenSearch Service for interacting with Elasticsearch/OpenSearch
 * Provides a facade over direct Elasticsearch calls with error handling and retry logic
 * 
 * This version is compatible with older Elasticsearch client response formats
 * (pre-7.x where responses are not nested under a 'body' property)
 */
export class OpenSearchService {
  private static client: Client | null = null;
  private static isInitialized = false;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  /**
   * Initialize the OpenSearch client
   * 
   * @param config Optional OpenSearch configuration (defaults to config from configProvider)
   * @returns Result indicating success or failure
   */



  /**
   * Initialize OpenSearch client with configuration
   * @param overrideConfig Optional configuration to override default ConfigProvider
   */
  public static async initialize(overrideConfig?: Partial<OpenSearchConfig>): Promise<Result<void>> {
    try {
      // Early return if already initialized
      if (this.isInitialized) {
        logger.debug('OpenSearch client already initialized');
        return success(undefined);
      }

      // Get and validate configuration
      const configResult = this.getValidatedConfig(overrideConfig);
      if (!configResult.success) {
        return configResult;
      }

      const config = configResult.data;

      // Initialize client
      const clientResult = await this.createClient(config);
      if (!clientResult.success) {
        return clientResult;
      }

      // Optionally verify connection
      if (process.env.OPENSEARCH_SKIP_PING !== 'true') {
        const pingResult = await this.verifyConnection();
        if (!pingResult.success) {
          return pingResult;
        }
      }

      this.isInitialized = true;
      logger.info({
        host: config.esHost,
        region: config.esRegion
      }, 'OpenSearch client initialized successfully');

      return success(undefined);
    } catch (error) {
      logger.error({ error }, 'Unexpected error during OpenSearch initialization');
      return failure(createError({
        name: 'OpenSearchInitializationError',
        message: `Unexpected initialization error: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_CONNECTION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }


  /**
   * Get and validate OpenSearch configuration
   */
  private static getValidatedConfig(overrideConfig?: Partial<OpenSearchConfig>): Result<OpenSearchConfig> {
    // Get base configuration from ConfigProvider or use override


    const opensearchConfig = ConfigProvider.get(CONFIG.OPENSEARCH_CONFIGS);
    if (!opensearchConfig) {
      logger.error('OpenSearch config not found - check shared.opensearch configuration is available');
    }
    
    // Extract values with fallbacks and individual field validation
    const accessKeyId = ConfigProvider.get(CONFIG.OPENSEARCH_ACCESS_KEY);
    const accessKeySecret = ConfigProvider.get(CONFIG.OPENSEARCH_SECRET_KEY);
    const esHost = ConfigProvider.get(CONFIG.OPENSEARCH_ENDPOINT);
    const esRegion =  ConfigProvider.get(CONFIG.OPENSEARCH_REGION, 'us-west-1') ; // Default fallback
    const tenantIsolationLevel =  ConfigProvider.get(CONFIG.OPENSEARCH_TENANT_ISOLATION, 'tenant'); // Default fallback
    
    // Log missing critical fields
    if (!accessKeyId) {
      logger.error('OpenSearch accessKeyId not found in configuration');
    }
    if (!accessKeySecret) {
      logger.error('OpenSearch accessKeySecret not found in configuration');
    }
    if (!esHost) {
      logger.error('OpenSearch esHost not found in shared configuration');
    }

    const baseConfig = {
      accessKeyId,
      accessKeySecret,
      esHost,
      esRegion,
      tenantIsolationLevel
    }

    if (!baseConfig) {
      return failure(createError({
        name: 'OpenSearchConfigurationError',
        message: 'OpenSearch configuration not found',
        type: 'CONFIGURATION_ERROR',
        statusCode: 500
      }));
    }

    // Validate required fields
    const validation = this.validateConfig(baseConfig);
    if (!validation.isValid) {
      return failure(createError({
        name: 'OpenSearchConfigurationError',
        message: `Invalid OpenSearch configuration: ${validation.errors.join(', ')}`,
        type: 'CONFIGURATION_ERROR',
        statusCode: 500
      }));
    }

    // Build final configuration with defaults
    const config: OpenSearchConfig = {
      accessKeyId: baseConfig.accessKeyId!,
      accessKeySecret: baseConfig.accessKeySecret!,
      esHost: baseConfig.esHost!,
      esRegion: baseConfig.esRegion || 'us-west-1'
    };

    // Validate URL format
    if (!this.isValidUrl(config.esHost)) {
      return failure(createError({
        name: 'OpenSearchConfigurationError',
        message: `Invalid OpenSearch host URL: ${config.esHost}`,
        type: 'CONFIGURATION_ERROR',
        statusCode: 500
      }));
    }

    return success(config);
  }

  /**
   * Validate configuration object
   */
  private static validateConfig(config: any): ValidationResult {

    try {
      const errors: string[] = [];
      const requiredFields = [
        { key: 'accessKeyId', display: 'AWS Access Key ID' },
        { key: 'accessKeySecret', display: 'AWS Access Key Secret' },
        { key: 'esHost', display: 'OpenSearch Host' }
      ];

      for (const field of requiredFields) {
        const value = config[field.key];
        if (!value || typeof value !== 'string' || value.trim() === '') {
          errors.push(`${field.display} is required`);
        }
      }

      // Validate region if provided
      if (config.esRegion && !/^[a-z]{2}-[a-z]+-\d{1}$/.test(config.esRegion)) {
        errors.push('Invalid AWS region format');
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [String(error)]
      };
    }


  }


  /**
   * Create OpenSearch client instance
   */
  private static async createClient(config: OpenSearchConfig): Promise<Result<void>> {
    try {
      const provider: AwsCredentialIdentityProvider = credentialFromKeys(
          config.accessKeyId,
          config.accessKeySecret
      );

      this.client = new Client({
        ...AwsSigv4Signer({
          region: config.esRegion!,
          getCredentials: provider,
        }),
        node: config.esHost,
        // Add additional client options
        requestTimeout: 30000,
        maxRetries: 3,
        ssl: {
          rejectUnauthorized: true
        }
      });

      return success(undefined);
    } catch (error) {
      return failure(createError({
        name: 'OpenSearchConnectionError',
        message: `Failed to create OpenSearch client: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_CONNECTION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }


  /**
   * Verify connection to OpenSearch cluster
   */
  private static async verifyConnection(): Promise<Result<void>> {

    if (OpenSearchService === null || OpenSearchService.client == null) {
      return failure({message: 'No OpenSearchService service!', type: AppErrorType.CONFIGURATION_ERROR})
    }

    try {
      const response = await OpenSearchService.client.ping();

      if (!response || response.statusCode !== 200) {
        return failure(createError({
          name: 'OpenSearchConnectionError',
          message: 'Failed to ping OpenSearch cluster',
          type: 'DATABASE_CONNECTION_ERROR',
          statusCode: 500
        }));
      }

      // Optionally check cluster health
      const health = await OpenSearchService.client.cluster.health();
      logger.info({
        status: health.body.status,
        numberOfNodes: health.body.number_of_nodes
      }, 'OpenSearch cluster health');

      return success(undefined);
    } catch (error) {
      return failure(createError({
        name: 'OpenSearchConnectionError',
        message: `Failed to verify OpenSearch connection: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_CONNECTION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Reset the service (mainly for testing)
   */
  public static reset(): void {
    this.isInitialized = false;
    this.client = null as any;
  }

  /**
   * Get initialization status
   */
  public static get initialized(): boolean {
    return this.isInitialized;
  }



  /**
   * Get the OpenSearch client (lazy initialization)
   *
   * @returns Result containing the client or failure
   */
  private static async getClient(): Promise<Result<Client>> {
    if (!this.isInitialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return failure(initResult.error);
      }
    }

    if (!this.client) {
      return failure(createError({
        name: 'OpenSearchConnectionError',
        message: 'OpenSearch client is not initialized',
        type: 'DATABASE_CONNECTION_ERROR',
        statusCode: 500
      }));
    }

    return success(this.client);
  }

  /**
   * Check if the connection is healthy and attempt to reconnect if not
   * 
   * @returns Result indicating if the connection is healthy
   */
  public static async healthCheck(): Promise<Result<boolean>> {
    try {
      // First ensure client is initialized
      if (!this.isInitialized || !this.client) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          logger.warn({
            error: initResult.error
          }, 'Health check failed - initialization failed');
          return failure(initResult.error);
        }
      }

      // Test connection with a simple cluster health query
      const testResult = await this.search('_cluster', { query: { match_all: {} } }, { size: 0 });
      if (testResult.success) {
        logger.debug('OpenSearch health check passed');
        return success(true);
      } else {
        logger.warn({
          error: testResult.error
        }, 'Health check failed - test query failed');
        
        // Reset client state on health check failure
        this.isInitialized = false;
        this.client = null;
        
        return failure(testResult.error || createError({
          name: 'OpenSearchHealthCheckError',
          message: 'Health check query failed',
          type: 'DATABASE_ERROR',
          statusCode: 500
        }));
      }
    } catch (error) {
      logger.error({
        error
      }, 'Health check failed with exception');
      
      // Reset client state on exception
      this.isInitialized = false;
      this.client = null;
      
      return failure(createError({
        name: 'OpenSearchHealthCheckError',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  public static generateContactId(businessId: number, acmeCrmId: number, externalId: number): string|null {
    if (!businessId || !acmeCrmId || !externalId) {
      return null;
    }
    const clearText = `${businessId}-${acmeCrmId}-${externalId}`;
    return crypto.createHash('sha256').update(clearText).digest('hex');
  }

  /**
   * Execute a search query with retry logic
   * 
   * @param index Index to search
   * @param query Query object
   * @param options Additional search options
   * @returns Result containing hits and total count
   */
  public static async search<T = any>(
    index: string,
    query: any,
    options: any = {}
  ): Promise<Result<SearchQueryResult<T>>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (clientResult.success === false) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            index,
            query,
            retryCount
          }, 'Search failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          index
        }, `Client initialization failed, retrying search (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const response = await client.search({
          index,
          body: query,
          ...options
        });
        
        // Legacy response format (pre-7.x)
        const hits = response.body.hits.hits.map((hit: any) => ({
          ...hit._source,
          _id: hit._id,
          _score: hit._score
        }));
        
        // Ensure total is always a number (not undefined)
        const total = typeof response.body.hits.total === 'object'
          ? response.body.hits.total.value || 0
          : response.body.hits.total || 0;
        
        return success({
          hits,
          total,
          aggregations: response.body.aggregations || undefined
        });
      } catch (error) {
        // Check if we should retry
        if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
          logger.warn({
            error, 
            index, 
            retryCount: retryCount + 1
          }, `Search query failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          // Reset the client if it's a connection error
          if (this.isConnectionError(error)) {
            this.isInitialized = false;
            this.client = null;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error, 
          index, 
          retryCount 
        }, 'Search query failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchQueryError',
          message: `Search query failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_QUERY_ERROR',
          statusCode: 500,
          cause: error,
          context: {
            operation: 'search',
            data: { index, query }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchQueryError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_QUERY_ERROR',
      statusCode: 500,
      context: {
        operation: 'search',
        data: { index, query }
      }
    }));
  }

  /**
   * Index a document with retry logic
   * 
   * @param index Index to write to
   * @param document Document to index
   * @param id Optional document ID
   * @param options Additional index options
   * @returns Result containing index operation result
   */
  public static async index(
    index: string,
    document: any,
    id?: string,
    options: any = {}
  ): Promise<Result<OpenSearchIndexResult>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (clientResult.success === false) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            index,
            id,
            retryCount
          }, 'Index operation failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          index,
          id
        }, `Client initialization failed, retrying index (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const params: any = {
          index,
          body: document,
          ...options
        };
        
        if (id) {
          params.id = id;
        }
        
        const response = await client.index(params);
        
        // Legacy response format (pre-7.x)
        return success({
          success: true,
          id: response.body._id,
          version: response.body._version,
          result: response.body.result
        });
      } catch (error) {
        // Check if we should retry
        if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
          logger.warn({
            error, 
            index, 
            id, 
            retryCount: retryCount + 1
          }, `Index operation failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          // Reset the client if it's a connection error
          if (this.isConnectionError(error)) {
            this.isInitialized = false;
            this.client = null;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error, 
          index, 
          id, 
          retryCount 
        }, 'Index operation failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchIndexError',
          message: `Index operation failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_WRITE_ERROR',
          statusCode: 500,
          cause: error,
          context: {
            operation: 'index',
            data: { index, id }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchIndexError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_WRITE_ERROR',
      statusCode: 500,
      context: {
        operation: 'index',
        data: { index, id }
      }
    }));
  }

  /**
   * Perform a bulk operation with retry logic
   * 
   * @param operations Bulk operations array
   * @param options Additional bulk options
   * @returns Result containing bulk operation result
   */
  public static async bulk(
    operations: any[],
    options: any = {}
  ): Promise<Result<OpenSearchOperationResult>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (!clientResult.success) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            operationsCount: operations.length,
            retryCount
          }, 'Bulk operation failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          operationsCount: operations.length
        }, `Client initialization failed, retrying bulk (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const response = await client.bulk({
          body: operations,
          ...options
        });

        logger.info({ response }, 'Bulk operation completed');
        
        // Legacy response format (pre-7.x)
        return success({
          success: !response.body.errors,
          items: response.body.items,
          errors: response.body.errors,
          took: response.body.took,
          affectedItems: response.body.items.length
        });
      } catch (error) {
        // Check if we should retry
        if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
          logger.warn({
            error, 
            operationsCount: operations.length, 
            retryCount: retryCount + 1
          }, `Bulk operation failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          // Reset the client if it's a connection error
          if (this.isConnectionError(error)) {
            this.isInitialized = false;
            this.client = null;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error, 
          operationsCount: operations.length, 
          retryCount 
        }, 'Bulk operation failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchBulkError',
          message: `Bulk operation failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_WRITE_ERROR',
          statusCode: 500,
          cause: error,
          context: {
            operation: 'bulk',
            data: { operationsCount: operations.length }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchBulkError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_WRITE_ERROR',
      statusCode: 500,
      context: {
        operation: 'bulk',
        data: { operationsCount: operations.length }
      }
    }));
  }

  /**
   * Delete a document with retry logic
   * 
   * @param index Index to delete from
   * @param id Document ID to delete
   * @param options Additional delete options
   * @returns Result containing delete operation result
   */
  public static async delete(
    index: string,
    id: string,
    options: any = {}
  ): Promise<Result<OpenSearchIndexResult>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (clientResult.success === false) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            index,
            id,
            retryCount
          }, 'Delete operation failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          index,
          id
        }, `Client initialization failed, retrying delete (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const response = await client.delete({
          index,
          id,
          ...options
        });

        // Legacy response format (pre-7.x)
        return success({
          success: true,
          id: response.body._id,
          version: response.body._version,
          result: response.body.result
        });
      } catch (error) {
        // Check if we should retry
        if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
          logger.warn({
            error, 
            index, 
            id, 
            retryCount: retryCount + 1
          }, `Delete operation failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          // Reset the client if it's a connection error
          if (this.isConnectionError(error)) {
            this.isInitialized = false;
            this.client = null;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error, 
          index, 
          id, 
          retryCount 
        }, 'Delete operation failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchDeleteError',
          message: `Delete operation failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_WRITE_ERROR',
          statusCode: 500,
          cause: error,
          context: {
            operation: 'delete',
            data: { index, id }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchDeleteError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_WRITE_ERROR',
      statusCode: 500,
      context: {
        operation: 'delete',
        data: { index, id }
      }
    }));
  }

  /**
   * Update a document by ID with retry logic
   * 
   * @param index Index to update document in
   * @param id Document ID to update
   * @param document Partial document data to update
   * @param options Additional update options
   * @returns Result containing update operation result
   */
  public static async update(
    index: string,
    id: string,
    document: any,
    options: any = {}
  ): Promise<Result<OpenSearchIndexResult>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (clientResult.success === false) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            index,
            id,
            retryCount
          }, 'Update operation failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          index,
          id
        }, `Client initialization failed, retrying update (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const response = await client.update({
          index,
          id,
          body: {
            doc: document
          },
          ...options
        });

        return success({
          success: true,
          id: response.body._id,
          index: response.body._index,
          version: response.body._version,
          result: response.body.result
        });

      } catch (error) {
        const errorInfo = getErrorInfo(error);
        
        // Check if this is a retryable error
        if (this.isRetryableError(errorInfo) && retryCount < this.MAX_RETRIES) {
          logger.warn({
            error: errorInfo,
            index,
            id,
            retryCount
          }, `Update operation failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error, 
          index, 
          id, 
          retryCount 
        }, 'Update operation failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchUpdateError',
          message: `Update operation failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_WRITE_ERROR',
          statusCode: 500,
          cause: error,
          context: {
            operation: 'update',
            data: { index, id, document }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchUpdateError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_WRITE_ERROR',
      statusCode: 500,
      context: {
        operation: 'update',
        data: { index, id, document }
      }
    }));
  }

  /**
   * Get a document by ID with retry logic
   * 
   * @param index Index to get document from
   * @param id Document ID to retrieve
   * @param options Additional get options (e.g., _source filtering)
   * @returns Result containing the document data
   */
  public static async get<T = unknown>(
    index: string,
    id: string,
    options: any = {}
  ): Promise<Result<OpensearchGetResponse<T>>> {
    let retryCount = 0;
    
    while (retryCount <= this.MAX_RETRIES) {
      const clientResult = await this.getClient();
      if (!clientResult.success) {
        if (retryCount === this.MAX_RETRIES) {
          logger.error({
            error: clientResult.error,
            index,
            id,
            retryCount
          }, 'Get operation failed - max retries exceeded for client initialization');
          return failure(clientResult.error);
        }
        
        logger.warn({
          error: clientResult.error,
          index,
          id
        }, `Client initialization failed, retrying get (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        continue;
      }

      const client = clientResult.data;

      try {
        const query = {
          index,
          id,
          ...options
        };

        logger.debug({query}, "OpenSearch GET operation");

        const response = await client.get(query);

        // Extract and normalize the response body to match our interface
        // Modern ES clients return { body: { _id, _source, found, _version } }
        const rawBody = response.body || response;
        const normalizedResponse: OpensearchGetResponse<T> = {
          _id: rawBody._id,
          _source: rawBody._source as T,
          found: rawBody.found,
          _version: rawBody._version
        };

        return success(normalizedResponse);

      } catch (error) {
        // Handle document not found (404) as a valid response with consistent structure
        const errorInfo = getErrorInfo(error);
        if (errorInfo.statusCode === 404 || errorInfo.status === 404) {
          const notFoundResponse: OpensearchGetResponse<T> = {
            _id: id,
            _source: {} as T,
            found: false
          };
          return success(notFoundResponse);
        }

        // Check if we should retry
        if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
          logger.warn({ 
            error, 
            index, 
            id, 
            retryCount: retryCount + 1 
          }, `Get operation failed, retrying (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          // Reset the client if it's a connection error
          if (this.isConnectionError(error)) {
            this.isInitialized = false;
            this.client = null;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
          continue;
        }
        
        logger.error({ 
          error: getErrorInfo(error), 
          index, 
          id, 
          retryCount 
        }, 'Get operation failed - max retries exceeded');
        
        return failure(createError({
          name: 'OpenSearchGetError',
          message: `Get operation failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'DATABASE_READ_ERROR',
          statusCode: errorInfo.statusCode || 500,
          cause: error,
          context: {
            operation: 'get',
            data: { index, id }
          }
        }));
      }
    }
    
    // This should never be reached, but included for completeness
    return failure(createError({
      name: 'OpenSearchGetError',
      message: 'Unexpected end of retry loop',
      type: 'DATABASE_READ_ERROR',
      statusCode: 500,
      context: {
        operation: 'get',
        data: { index, id }
      }
    }));
  }

  /**
   * Close the OpenSearch client connection
   */
  public static async close(): Promise<Result<void>> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.isInitialized = false;
        logger.info({}, 'OpenSearch client closed');
      }
      return success(undefined);
    } catch (error) {
      return failure(createError({
        name: 'OpenSearchCloseError',
        message: `Failed to close OpenSearch client: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_CONNECTION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Check if an index exists
   */
  public static async indexExists(index: string): Promise<Result<boolean>> {
    const clientResult = await this.getClient();
    if (!clientResult.success) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.indices.exists({
        index: index  // Some versions accept string directly, others need array
      });

      // The response structure varies by client version:
      // - Older: returns boolean directly
      // - Newer: returns { body: boolean, statusCode: number }
      // - Some: just use statusCode (200 = exists, 404 = doesn't exist)

      const exists = typeof response === 'boolean'
          ? response
          : response.body !== undefined
              ? response.body
              : response.statusCode === 200;

      return success(exists);

    } catch (error) {
      // Note: 404 is not really an error, it means index doesn't exist
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('index_not_found'))) {
        return success(false);
      }

      return failure(createError({
        name: 'IndexExistsError',
        message: `Failed to check if index ${index} exists: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Create an index with optional settings and mappings
   */
  public static async createIndex(
    index: string,
    body?: { settings?: any; mappings?: any }
  ): Promise<Result<any>> {
    const clientResult = await this.getClient();
    if (!clientResult.success) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.indices.create({
        index,
        body: body || {}
      });
      return success(response.body);
    } catch (error) {
      return failure(createError({
        name: 'CreateIndexError',
        message: `Failed to create index ${index}: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Delete an index
   */
  public static async deleteIndex(index: string): Promise<Result<any>> {
    const clientResult = await this.getClient();
    if (!clientResult.success) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.indices.delete({ index });
      return success(response.body);
    } catch (error) {
      return failure(createError({
        name: 'DeleteIndexError',
        message: `Failed to delete index ${index}: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Put an index template
   */
  public static async putIndexTemplate(
    name: string,
    body: any
  ): Promise<Result<any>> {
    const clientResult = await this.getClient();
    if (clientResult.success === false) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.indices.putIndexTemplate({
        name,
        body
      });
      return success(response.body);
    } catch (error) {
      return failure(createError({
        name: 'PutIndexTemplateError',
        message: `Failed to put index template ${name}: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Get indices information
   */
  public static async getIndices(index?: string): Promise<Result<any>> {
    const clientResult = await this.getClient();
    if (!clientResult.success) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.cat.indices({
        index: index ? [index] : undefined,  // Convert to array or undefined (not '*')
        format: 'json',
        h: ['index', 'docs.count', 'store.size', 'creation.date']  // Array format
      } as any);

      return success(response.body);

    } catch (error) {
      return failure(createError({
        name: 'GetIndicesError',
        message: `Failed to get indices: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Get index mapping
   */
  public static async getMapping(index: string): Promise<Result<any>> {
    const clientResult = await this.getClient();
    if (clientResult.success === false) {
      return failure(clientResult.error);
    }

    const client = clientResult.data;

    try {
      const response = await client.indices.getMapping({ index });
      return success(response.body);
    } catch (error) {
      return failure(createError({
        name: 'GetMappingError',
        message: `Failed to get mapping for index ${index}: ${error instanceof Error ? error.message : String(error)}`,
        type: 'DATABASE_OPERATION_ERROR',
        statusCode: 500,
        cause: error
      }));
    }
  }

  /**
   * Check if an error is retryable
   * 
   * @param error The error to check
   * @returns True if the error is retryable
   */
  private static isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    
    // Common Elasticsearch error types that are retryable
    const retryableErrorMessages = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'socket hang up',
      'Gateway Timeout',
      'Service Unavailable',
      'Too Many Requests',
      'Request Timeout'
    ];
    
    return retryableErrorMessages.some(msg => error.message.includes(msg));
  }

  /**
   * Check if an error is a connection error
   * 
   * @param error The error to check
   * @returns True if the error is a connection error
   */
  private static isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    
    // Common Elasticsearch connection error messages
    const connectionErrorMessages = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'socket hang up',
      'no living connections'
    ];
    
    return connectionErrorMessages.some(msg => error.message.includes(msg));
  }

  /**
   * List all indices - useful for connectivity and permission testing
   * This tests: connectivity, authentication, and read permissions
   */
  public static async listIndices(): Promise<Result<any[]>> {
    const initResult = await this.initialize();
    if (!initResult.success) {
      return failure(createError({
        name: 'OpenSearchInitializationError',
        message: `Failed to initialize OpenSearch service: ${initResult.error}`,
        type: 'INITIALIZATION_ERROR' as AppErrorType,
        statusCode: 500
      }));
    }

    try {
      logger.debug('Listing OpenSearch indices for connectivity test');
      
      // Use cat.indices API to list all indices - this tests connectivity, auth, and permissions
      const response = await this.client!.cat.indices({
        format: 'json',
        h: ['index', 'health', 'status', 'docs.count', 'store.size']
      });

      logger.info({ indexCount: response.body?.length || 0 }, 'Successfully listed OpenSearch indices');
      return success(response.body || []);

    } catch (error) {
      logger.error({ error: getErrorInfo(error) }, 'Failed to list OpenSearch indices');
      return failure(createError({
        name: 'OpenSearchListIndicesError',
        message: `Failed to list indices: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'OPERATION_ERROR' as AppErrorType,
        statusCode: 500
      }));
    }
  }
}
