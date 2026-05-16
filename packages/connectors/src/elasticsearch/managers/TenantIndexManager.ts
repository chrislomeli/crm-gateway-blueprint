/**
 * TenantIndexManager - Elasticsearch Tenant Index Management Service
 *
 * This service provides high-level management of tenant-specific Elasticsearch indices
 * in the Blueprint CRM system. It handles index creation, deletion, and lifecycle
 * management with support for multiple index types per tenant.
 *
 * Key features:
 * - Multi-tenant index isolation using pattern: {indexType}-{businessId}
 * - Template-based index creation for consistency
 * - Automatic template management and application
 * - Bulk operations for multiple tenants
 * - Integration with existing OpenSearchService
 *
 * @module services/elasticsearch/TenantIndexManager
 */

import {createError, failure, logger, Result, success} from '@platform/core';
import {OpenSearchService} from '../core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
    BulkOperationResult,
    BulkTenantIndexOperation,
    IndexOperationResult,
    ListTenantIndicesOptions,
    StandardIndexTypes,
    TenantIndexConfig,
    TenantIndexInfo,
    TenantIsolationConfig,
    TenantIsolationLevel,
    TenantIsolationLevels
} from '../core';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default configuration for tenant indices
 */
const DEFAULT_INDEX_CONFIG: TenantIndexConfig = {
    numberOfShards: 1,
    numberOfReplicas: 1,
    refreshInterval: '5s',
    maxResultWindow: 10000
};

/**
 * TenantIndexManager provides comprehensive management of tenant-specific Elasticsearch indices
 */
export class TenantIndexManager {
    private static instance: TenantIndexManager | null = null;
    private templatesLoaded: boolean = false;
    private readonly log = logger;
    private tenantIsolationLevel: TenantIsolationLevel = TenantIsolationLevels.TENANT; // Default to tenant-level isolation

    /**
     * Private constructor for singleton pattern
     */
    private constructor() {
        // OpenSearchService is static, no need to instantiate
    }

    /**
     * Get singleton instance of TenantIndexManager
     */
    public static getInstance(): TenantIndexManager {
        if (!TenantIndexManager.instance) {
            TenantIndexManager.instance = new TenantIndexManager();
        }
        return TenantIndexManager.instance;
    }

    /**
     * Generate index name from business ID and index type based on isolation level
     */
    public generateIndexName(businessId: string, indexType: string): string {
        switch (this.tenantIsolationLevel) {
            case TenantIsolationLevels.TENANT:
                return `${indexType}-${businessId}`;
            case TenantIsolationLevels.CRM:
                // For CRM-level isolation, use a shared index across all tenants
                return `${indexType}-shared`;
            case TenantIsolationLevels.NONE:
                // For no isolation, use just the index type
                return indexType;
            default:
                // Fallback to tenant-level isolation
                return `${indexType}-${businessId}`;
        }
    }

    /**
     * Static helper for backward compatibility - uses tenant-level isolation
     */
    public static generateIndexName(businessId: string, indexType: string): string {
        return `${indexType}-${businessId}`;
    }

    /**
     * Parse index name to extract business ID and index type
     */
    public static parseIndexName(indexName: string): { businessId: string; indexType: string } | null {
        const parts = indexName.split('-');
        if (parts.length < 2) {
            return null;
        }

        const businessId = parts[parts.length - 1];
        const indexType = parts.slice(0, -1).join('-');

        return {businessId, indexType};
    }

    /**
     * Initialize the service and ensure templates are loaded
     */
    public async initialize(isolationConfig?: TenantIsolationConfig): Promise<Result<void>> {
        // Set tenant isolation level if provided
        if (isolationConfig?.tenantIsolationLevel) {
            this.tenantIsolationLevel = isolationConfig.tenantIsolationLevel;
            this.log.info({ tenantIsolationLevel: this.tenantIsolationLevel }, 'TenantIndexManager configured with isolation level');
        }
        try {
            // Initialize OpenSearch service (static call)
            const initResult = await OpenSearchService.initialize();
            if (!initResult.success) {
                return failure(createError({
                    name: 'TenantIndexManagerInitError',
                    message: 'Failed to initialize OpenSearch service',
                    cause: initResult.error
                }));
            }

            // Load and apply templates
            const templateResult = await this.ensureTemplatesLoaded();
            if (!templateResult.success) {
                return failure(createError({
                    name: 'TemplateLoadError',
                    message: 'Failed to load index templates',
                    cause: templateResult.error
                }));
            }

            this.log.info({}, 'TenantIndexManager initialized successfully');
            return success(undefined);
        } catch (error) {
            return failure(createError({
                name: 'TenantIndexManagerInitError',
                message: 'Failed to initialize TenantIndexManager',
                cause: error
            }));
        }
    }

    /**
     * Get or create a tenant index for the specified type
     */
    public async getOrCreateTenantIndex(
        businessId: string,
        indexType: string,
        config?: TenantIndexConfig
    ): Promise<Result<TenantIndexInfo>> {
        try {
            const indexName = this.generateIndexName(businessId, indexType);

            // Check if index exists
            const existsResult = await this.indexExists(indexName);
            if (!existsResult.success) {
                return failure(existsResult.error);
            }

            const indexInfo: TenantIndexInfo = {
                indexName,
                businessId,
                indexType,
                exists: existsResult.data,
                createdAt: new Date()
            };

            if (existsResult.data) {
                this.log.debug({indexName}, 'Index already exists');
                return success(indexInfo);
            }

            // Create the index
            const createResult = await this.createTenantIndex(businessId, indexType, config);
            if (!createResult.success) {
                return failure(createResult.error);
            }

            this.log.info({indexName, businessId, indexType}, 'Created new tenant index');
            return success(indexInfo);
        } catch (error) {
            return failure(createError({
                name: 'GetOrCreateIndexError',
                message: `Failed to get or create index for tenant ${businessId}, type ${indexType}`,
                cause: error
            }));
        }
    }

    /**
     * Create a new tenant index
     */
    public async createTenantIndex(
        businessId: string,
        indexType: string,
        config?: TenantIndexConfig
    ): Promise<Result<IndexOperationResult>> {
        try {
            const indexName = this.generateIndexName(businessId, indexType);
            const mergedConfig = {...DEFAULT_INDEX_CONFIG, ...config};

            // Ensure templates are loaded
            await this.ensureTemplatesLoaded();

            // Create index with settings
            const indexBody = {
                settings: {
                    number_of_shards: mergedConfig.numberOfShards,
                    number_of_replicas: mergedConfig.numberOfReplicas,
                    refresh_interval: mergedConfig.refreshInterval,
                    max_result_window: mergedConfig.maxResultWindow
                }
            };

            const createResult = await OpenSearchService.createIndex(indexName, indexBody);
            if (!createResult.success) {
                return failure(createError({
                    name: 'IndexCreationError',
                    message: `Failed to create index ${indexName}`,
                    cause: createResult.error
                }));
            }

            const result: IndexOperationResult = {
                success: true,
                indexName,
                operation: 'create',
                details: {
                    businessId,
                    indexType,
                    config: mergedConfig
                }
            };

            return success(result);
        } catch (error) {
            return failure(createError({
                name: 'CreateIndexError',
                message: `Failed to create tenant index for ${businessId}, type ${indexType}`,
                cause: error
            }));
        }
    }

    /**
     * Delete a tenant index
     */
    public async deleteTenantIndex(
        businessId: string,
        indexType: string
    ): Promise<Result<IndexOperationResult>> {
        try {
            const indexName = this.generateIndexName(businessId, indexType);

            // Check if index exists first
            const existsResult = await this.indexExists(indexName);
            if (!existsResult.success) {
                return failure(existsResult.error);
            }

            if (!existsResult.data) {
                return success({
                    success: true,
                    indexName,
                    operation: 'delete',
                    details: {message: 'Index did not exist'}
                });
            }

            // Delete the index
            const deleteResult = await OpenSearchService.deleteIndex(indexName);
            if (!deleteResult.success) {
                return failure(deleteResult.error);
            }

            const result: IndexOperationResult = {
                success: true,
                indexName,
                operation: 'delete',
                details: {
                    businessId,
                    indexType
                }
            };

            this.log.info({indexName, businessId, indexType}, 'Deleted tenant index');
            return success(result);
        } catch (error) {
            return failure(createError({
                name: 'DeleteIndexError',
                message: `Failed to delete tenant index for ${businessId}, type ${indexType}`,
                cause: error
            }));
        }
    }

    /**
     * Convenience method for contacts index
     */
    public async getOrCreateContactsIndex(businessId: string): Promise<Result<TenantIndexInfo>> {
        return this.getOrCreateTenantIndex(businessId, StandardIndexTypes.CONTACTS);
    }

    /**
     * Convenience method for deals index
     */
    public async getOrCreateDealsIndex(businessId: string): Promise<Result<TenantIndexInfo>> {
        return this.getOrCreateTenantIndex(businessId, StandardIndexTypes.DEALS);
    }

    /**
     * Convenience method for companies index
     */
    public async getOrCreateCompaniesIndex(businessId: string): Promise<Result<TenantIndexInfo>> {
        return this.getOrCreateTenantIndex(businessId, StandardIndexTypes.COMPANIES);
    }

    /**
     * List all indices for a specific tenant
     */
    public async listTenantIndices(
        businessId: string,
        options?: ListTenantIndicesOptions
    ): Promise<Result<TenantIndexInfo[]>> {
        try {
            // Get all indices matching the tenant pattern
            const pattern = options?.indexType
                ? this.generateIndexName(businessId, options.indexType)
                : this.getTenantPattern(businessId);

            const indicesResult = await OpenSearchService.getIndices(pattern);
            if (!indicesResult.success) {
                return failure(indicesResult.error);
            }

            const indices: TenantIndexInfo[] = [];

            for (const indexData of indicesResult.data || []) {
                const parsed = TenantIndexManager.parseIndexName(indexData.index);
                if (!parsed || parsed.businessId !== businessId) {
                    continue;
                }

                const indexInfo: TenantIndexInfo = {
                    indexName: indexData.index,
                    businessId: parsed.businessId,
                    indexType: parsed.indexType,
                    exists: true,
                    documentCount: parseInt(indexData['docs.count'] || '0'),
                    sizeInBytes: this.parseSize(indexData['store.size']),
                    createdAt: indexData['creation.date'] ? new Date(parseInt(indexData['creation.date'])) : undefined
                };

                // Include mappings if requested
                if (options?.includeMappings) {
                    try {
                        const mappingResult = await OpenSearchService.getMapping(indexData.index);
                        if (mappingResult.success) {
                            indexInfo.mapping = mappingResult.data[indexData.index]?.mappings;
                        }
                    } catch (error) {
                        this.log.warn({index: indexData.index, error}, 'Failed to get mapping for index');
                    }
                }

                indices.push(indexInfo);
            }

            return success(indices);
        } catch (error) {
            return failure(createError({
                name: 'ListIndicesError',
                message: `Failed to list indices for tenant ${businessId}`,
                cause: error
            }));
        }
    }

    /**
     * Delete all indices for a tenant
     */
    public async deleteAllTenantIndices(businessId: string): Promise<Result<BulkOperationResult>> {
        try {
            const listResult = await this.listTenantIndices(businessId);
            if (!listResult.success) {
                return failure(listResult.error);
            }

            const operations: BulkTenantIndexOperation[] = listResult.data.map(index => ({
                businessId,
                indexType: index.indexType,
                operation: 'delete'
            }));

            return this.bulkOperations(operations);
        } catch (error) {
            return failure(createError({
                name: 'DeleteAllIndicesError',
                message: `Failed to delete all indices for tenant ${businessId}`,
                cause: error
            }));
        }
    }

    /**
     * Perform bulk operations on multiple tenant indices
     */
    public async bulkOperations(operations: BulkTenantIndexOperation[]): Promise<Result<BulkOperationResult>> {
        const results: IndexOperationResult[] = [];
        const errors: string[] = [];
        let successful = 0;

        for (const operation of operations) {
            try {
                let result: Result<IndexOperationResult>;

                if (operation.operation === 'create' || operation.operation === 'index') {
                    result = await this.createTenantIndex(
                        operation.businessId,
                        operation.indexType,
                        operation.config
                    );
                } else if (operation.operation === 'delete') {
                    result = await this.deleteTenantIndex(
                        operation.businessId,
                        operation.indexType
                    );
                } else {
                    errors.push(`Unknown operation: ${operation.operation}`);
                    continue;
                }

                if (!result.success) {
                    errors.push(`Failed ${operation.operation} for ${operation.businessId}-${operation.indexType}: ${result.error.message}`);
                } else {
                    successful++;
                }
            } catch (error) {
                const errorMsg = `Exception during ${operation.operation} for ${operation.businessId}-${operation.indexType}: ${error}`;
                errors.push(errorMsg);
            }
        }

        const bulkResult: BulkOperationResult = {
            total: operations.length,
            successful,
            failed: operations.length - successful,
            errors: errors.map((error, index) => ({id: index.toString(), error})),
            took: 0
        };

        return success(bulkResult);
    }

    /**
     * Perform bulk tenant index operations
     * Supports multiple operations (index, delete, update) across different tenant indices
     */
    async bulkTenantIndexOperations(operations: BulkTenantIndexOperation[]): Promise<Result<BulkOperationResult>> {
        this.log.info({
            operationCount: operations.length
        }, 'Performing bulk tenant index operations');

        try {
            // Group operations by index for efficiency
            const indexGroups = new Map<string, BulkTenantIndexOperation[]>();
            for (const operation of operations) {
                const indexName = this.getIndexName(operation.businessId, operation.indexType);
                if (!indexGroups.has(indexName)) {
                    indexGroups.set(indexName, []);
                }
                indexGroups.get(indexName)!.push(operation);
            }

            // Validate that all target indices exist
            for (const [indexName, ops] of indexGroups) {
                const existsResult = await OpenSearchService.indexExists(indexName);
                if (!existsResult.success) {
                    return failure(createError({
                        name: 'ValidationError',
                        message: `Failed to validate index existence for bulk operations`,
                        context: {indexName, operationCount: ops.length} as any
                    }));
                }

                if (!existsResult.data) {
                    return failure(createError({
                        name: 'IndexNotFoundError',
                        message: `Target index ${indexName} does not exist for bulk operations`,
                        context: {indexName, operationCount: ops.length} as any
                    }));
                }
            }

            // Build bulk request body
            const bulkBody: any[] = [];
            for (const operation of operations) {
                const indexName = this.getIndexName(operation.businessId, operation.indexType);

                switch (operation.operation) {
                    case 'index':
                        bulkBody.push({index: {_index: indexName, _id: operation.documentId}});
                        bulkBody.push(operation.document);
                        break;

                    case 'create':
                        bulkBody.push({create: {_index: indexName, _id: operation.documentId}});
                        bulkBody.push(operation.document);
                        break;

                    case 'delete':
                        bulkBody.push({delete: {_index: indexName, _id: operation.documentId}});
                        break;

                    case 'update':
                        bulkBody.push({update: {_index: indexName, _id: operation.documentId}});
                        bulkBody.push({doc: operation.document});
                        break;

                    default:
                        return failure(createError({
                            name: 'InvalidOperationError',
                            message: `Unsupported bulk operation: ${(operation as any).operation}`,
                            context: {operation: JSON.stringify(operation)} as any
                        }));
                }
            }

            // Execute bulk operation
            const bulkResult = await OpenSearchService.bulk(bulkBody);
            if (!bulkResult.success) {
                return failure(createError({
                    name: 'BulkOperationError',
                    message: 'Failed to execute bulk operations',
                    cause: bulkResult.error
                }));
            }

            // Parse results
            const results = bulkResult.data.items || [];
            const successful: string[] = [];
            const failed: Array<{ id: string; error: string }> = [];

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const operation = operations[i];

                // Handle different operation result structures
                const operationResult = result.index || result.create || result.delete || result.update;

                if (operationResult?.error) {
                    failed.push({
                        id: operationResult._id || `operation-${i}`,
                        error: typeof operationResult.error === 'string'
                            ? operationResult.error
                            : JSON.stringify(operationResult.error)
                    });
                } else if (operationResult) {
                    successful.push(operationResult._id || `operation-${i}`);
                } else {
                    failed.push({
                        id: `operation-${i}`,
                        error: 'Unknown operation result structure'
                    });
                }
            }

            const operationResult: BulkOperationResult = {
                total: operations.length,
                successful: successful.length,
                failed: failed.length,
                errors: failed,
                took: (bulkResult.data as any).took || 0
            };

            this.log.info({
                total: operationResult.total,
                successful: operationResult.successful,
                failed: operationResult.failed,
                took: operationResult.took
            }, 'Bulk tenant index operations completed');

            return success(operationResult);

        } catch (error) {
            this.log.error({
                error: error instanceof Error ? error.message : String(error),
                operationCount: operations.length
            }, 'Unexpected error during bulk operations');

            return failure(createError({
                name: 'BulkOperationError',
                message: 'Unexpected error during bulk tenant index operations',
                cause: error
            }));
        }
    }

    /**
     * Check if an index exists
     */
    private async indexExists(indexName: string): Promise<Result<boolean>> {
        return OpenSearchService.indexExists(indexName);
    }

    /**
     * Ensure index templates are loaded into Elasticsearch
     */
    private async ensureTemplatesLoaded(): Promise<Result<void>> {
        if (this.templatesLoaded) {
            return success(undefined);
        }

        try {
            const templatesDir = path.join(__dirname, '..', 'templates');
            const templateFiles = fs.readdirSync(templatesDir).filter(file => file.endsWith('.json'));

            for (const file of templateFiles) {
                const templatePath = path.join(templatesDir, file);
                const templateName = path.basename(file, '.json');

                try {
                    const templateContent = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
                    await this.applyTemplate(templateName, templateContent);
                    this.log.debug({templateName}, 'Applied index template');
                } catch (error) {
                    this.log.warn({templateName, error}, 'Failed to apply template');
                }
            }

            this.templatesLoaded = true;
            return success(undefined);
        } catch (error) {
            return failure(createError({
                name: 'TemplateLoadError',
                message: 'Failed to load index templates',
                cause: error
            }));
        }
    }

    /**
     * Apply an index template to Elasticsearch
     */
    private async applyTemplate(templateName: string, template: any): Promise<Result<void>> {
        const result = await OpenSearchService.putIndexTemplate(templateName, template);
        if (!result.success) {
            return failure(createError({
                name: 'ApplyTemplateError',
                message: `Failed to apply template ${templateName}`,
                cause: result.error
            }));
        }
        return success(undefined);
    }

    /**
     * Parse size string to bytes
     */
    private parseSize(sizeStr: string): number {
        if (!sizeStr) return 0;

        const units: Record<string, number> = {
            'b': 1,
            'kb': 1024,
            'mb': 1024 * 1024,
            'gb': 1024 * 1024 * 1024
        };

        const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2] || 'b';

        return Math.round(value * (units[unit] || 1));
    }

    private getIndexName(businessId: string, indexType: string): string {
        return this.generateIndexName(businessId, indexType);
    }

    /**
     * Get tenant pattern for listing indices based on isolation level
     */
    private getTenantPattern(businessId: string): string {
        switch (this.tenantIsolationLevel) {
            case TenantIsolationLevels.TENANT:
                return `*-${businessId}`;
            case TenantIsolationLevels.CRM:
                return '*-shared';
            case TenantIsolationLevels.NONE:
                return '*';
            default:
                return `*-${businessId}`;
        }
    }
}
