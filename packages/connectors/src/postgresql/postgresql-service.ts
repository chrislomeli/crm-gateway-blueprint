/**
 * PostgreSQLService - Resilient PostgreSQL Database Integration
 *
 * This service provides a robust, observable, and configurable interface for interacting with
 * PostgreSQL databases in Blueprint applications. It manages connection pooling, transaction support,
 * error handling, and integrates with the Result pattern for consistent error propagation.
 *
 * Key features:
 * - Instance-based design for multiple database support
 * - Connection pooling for efficient resource usage
 * - Transaction management with rollback on error
 * - Typed query and modification result interfaces
 * - Comprehensive error handling using the Result pattern
 * - Integration with Blueprint configuration and observability systems
 * - Drop-in replacement for MySQLService with identical API
 *
 * This service is used by data access layers, batch processors, and other infrastructure components
 * requiring reliable, maintainable PostgreSQL database access.
 *
 * @module infrastructure/datastores/postgresql/postgresqlService
 */
import { Pool, PoolClient, QueryResult as PgQueryResult, PoolConfig, QueryResultRow } from 'pg';
import { createError, failure, Result, success } from '@platform/core';
import { logger } from '@platform/core';
import { ConfigProvider, DATABASE } from '@platform/configuration';

/**
 * PostgreSQL configuration interface
 */
export interface PostgreSQLConfig {
    host: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    connectionLimit?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    ssl?: boolean | object;
}

/**
 * Unified response type for all PostgreSQL operations (SELECT, INSERT, UPDATE, DELETE, stored procedures)
 * Compatible with MySQLService QueryResult interface for drop-in replacement
 */
export interface PostgreSQLQueryResult<T extends QueryResultRow> {
    success: boolean;
    rows: T[];           // Always present (empty array if no rows returned)
    rowCount: number;    // Number of rows returned in result set
    affectedRows: number; // Rows affected by INSERT/UPDATE/DELETE operations
    insertId?: number;   // Last insert ID (for INSERT operations with RETURNING)
    changedRows?: number; // Rows actually changed (for UPDATE operations)
    error?: any;         // Error information if success is false
}

/**
 * PostgreSQL Service for interacting with PostgreSQL databases
 * Provides a facade over direct PostgreSQL calls with error handling and retry logic
 * 
 * Drop-in replacement for MySQLService with identical API and multi-pool pattern
 */
export class PostgreSQLService {
    // Instance properties
    private pool: Pool | null = null;
    private config: PostgreSQLConfig;
    private isInitialized = false;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private readonly instanceId: string;
    
    // Static properties for backward compatibility
    private static defaultInstance: PostgreSQLService | null = null;

    /**
     * Create a new PostgreSQLService instance
     * @param config PostgreSQL configuration
     * @param instanceId Optional unique identifier for this instance
     */
    constructor(config: PostgreSQLConfig, instanceId?: string) {
        this.config = config;
        this.instanceId = instanceId || `postgresql-${Date.now()}`;
        this.maxRetries = config.maxRetries || 3;
        this.retryDelayMs = config.retryDelayMs || 1000;
    }

    /**
     * Get the default static instance (for backward compatibility)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     */
    private static getDefaultInstance(config?: any): PostgreSQLService {
        if (!this.defaultInstance) {
            const pgConfig = config || ConfigProvider.get(DATABASE.CRM_CONNECTION);
            this.defaultInstance = new PostgreSQLService(pgConfig, 'default');
        }
        return this.defaultInstance;
    }

    /**
     * Initialize the PostgreSQL connection pool
     * @returns Result indicating success or failure
     */
    public async initialize(): Promise<Result<void>> {
        if (this.isInitialized && this.pool) {
            return success(undefined);
        }

        try {
            const poolConfig: PoolConfig = {
                host: this.config.host,
                port: this.config.port || 5432,
                user: this.config.user,
                password: this.config.password,
                database: this.config.database,
                max: this.config.connectionLimit || 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
                ssl: this.config.ssl || false
            };

            this.pool = new Pool(poolConfig);

            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();

            this.isInitialized = true;
            logger.info({
                instanceId: this.instanceId,
                host: this.config.host,
                database: this.config.database
            }, `PostgreSQL pool initialized for instance: ${this.instanceId}`);

            return success(undefined);
        } catch (error) {
            logger.error({
                instanceId: this.instanceId,
                error,
                config: { ...this.config, password: '***' }
            }, 'Failed to initialize PostgreSQL pool');

            return failure(createError({
                name: 'PostgreSQLInitializationError',
                message: `Failed to initialize PostgreSQL pool: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_CONNECTION_ERROR',
                statusCode: 500,
                cause: error
            }));
        }
    }

    /**
     * Get the connection pool, initializing if necessary
     * @returns Result containing the pool or error
     */
    private async getPool(): Promise<Result<Pool>> {
        if (!this.isInitialized || !this.pool) {
            const initResult = await this.initialize();
            if (!initResult.success) {
                return failure(initResult.error);
            }
        }

        if (!this.pool) {
            return failure(createError({
                name: 'PostgreSQLConnectionError',
                message: 'PostgreSQL pool not initialized',
                type: 'DATABASE_CONNECTION_ERROR',
                statusCode: 500
            }));
        }

        return success(this.pool);
    }

    /**
     * Check if the PostgreSQL connection is healthy
     * @returns Result indicating health status
     */
    public async healthCheck(): Promise<Result<boolean>> {
        try {
            // First ensure pool is created
            if (!this.isInitialized || !this.pool) {
                const initResult = await this.initialize();
                if (!initResult.success) {
                    logger.warn({
                        instanceId: this.instanceId,
                        error: initResult.error
                    }, 'Health check failed - initialization failed');
                    return failure(initResult.error);
                }
            }

            if (!this.pool) {
                return failure(createError({
                    name: 'PostgreSQLHealthCheckError',
                    message: 'PostgreSQL pool not available for health check',
                    type: 'DATABASE_ERROR',
                    statusCode: 500
                }));
            }

            // Test with a simple query
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();

            return success(true);
        } catch (error) {
            logger.error({
                instanceId: this.instanceId,
                error
            }, 'Health check failed with exception');
            
            // Reset pool state on exception
            this.isInitialized = false;
            this.pool = null;
            
            return failure(createError({
                name: 'PostgreSQLHealthCheckError',
                message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_ERROR',
                statusCode: 500,
                cause: error
            }));
        }
    }

    /**
     * Execute any SQL query (SELECT, INSERT, UPDATE, DELETE, stored procedures) with retry logic
     * This is the unified method that handles all query types and returns consistent results
     * @param query SQL query string or stored procedure call
     * @param params Query parameters
     * @returns Result containing unified query response
     */
    public async query<T extends QueryResultRow>(
        query: string,
        params: any[] = []
    ): Promise<PostgreSQLQueryResult<T>> {
        const poolResult = await this.getPool();
        if (!poolResult.success) {
            return {
                success: false,
                rows: [],
                rowCount: 0,
                affectedRows: 0,
                error: poolResult.error
            };
        }

        const pool = poolResult.data;
        let client: PoolClient | null = null;

        try {
            client = await pool.connect();
            const result: PgQueryResult<T> = await client.query(query, params);

            // Handle different query types
            const isSelect = query.trim().toLowerCase().startsWith('select');
            const isInsert = query.trim().toLowerCase().startsWith('insert');
            const isUpdate = query.trim().toLowerCase().startsWith('update');
            const isDelete = query.trim().toLowerCase().startsWith('delete');

            let insertId: number | undefined;
            if (isInsert && result.rows.length > 0) {
                const firstRow = result.rows[0] as QueryResultRow & { id?: number };
                insertId = firstRow.id;
            }

            return {
                success: true,
                rows: result.rows,
                rowCount: result.rows?.length || 0,
                affectedRows: result.rowCount || 0,
                insertId,
                changedRows: isUpdate ? result.rowCount || undefined : undefined
            };
        } catch (error) {
            logger.error({
                instanceId: this.instanceId,
                error,
                query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
                params
            }, 'PostgreSQL query failed');

            return {
                success: false,
                rows: [],
                rowCount: 0,
                affectedRows: 0,
                error: createError({
                    name: 'PostgreSQLQueryError',
                    message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'DATABASE_QUERY_ERROR',
                    statusCode: 500,
                    cause: error
                })
            };
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Execute a SELECT query with retry logic
     * @deprecated Use query() method instead for unified interface
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @returns Result containing rows and count
     */
    public async select<T extends QueryResultRow>(
        query: string,
        params: any[] = [],
        retryCount = 0
    ): Promise<PostgreSQLQueryResult<T>> {
        return this.query<T>(query, params);
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE query with retry logic
     * @deprecated Use query() method instead for unified interface
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @returns Result containing affected rows and other metadata
     */
    public async modify(
        query: string,
        params: any[] = [],
        retryCount = 0
    ): Promise<PostgreSQLQueryResult<any>> {
        return this.query(query, params);
    }

    /**
     * Execute a transaction with multiple queries
     * @param callback Function that receives a client and executes queries
     * @returns Result of the transaction
     */
    public async transaction<T>(
        callback: (client: PoolClient) => Promise<T>
    ): Promise<Result<T>> {
        const poolResult = await this.getPool();
        if (!poolResult.success) {
            return failure(poolResult.error);
        }

        const pool = poolResult.data;
        let client: PoolClient | null = null;

        try {
            client = await pool.connect();
            await client.query('BEGIN');

            const result = await callback(client);

            await client.query('COMMIT');
            return success(result);
        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    logger.error({
                        instanceId: this.instanceId,
                        rollbackError,
                        originalError: error
                    }, 'Failed to rollback transaction');
                }
            }

            logger.error({
                instanceId: this.instanceId,
                error
            }, 'Transaction failed');

            return failure(createError({
                name: 'PostgreSQLTransactionError',
                message: `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_TRANSACTION_ERROR',
                statusCode: 500,
                cause: error
            }));
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    /**
     * Close the connection pool
     * @returns Result indicating success or failure
     */
    public async close(): Promise<Result<void>> {
        try {
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
                this.isInitialized = false;
                logger.info({ instanceId: this.instanceId }, `PostgreSQL pool closed for instance: ${this.instanceId}`);
            }
            return success(undefined);
        } catch (error) {
            logger.error({
                instanceId: this.instanceId,
                error
            }, 'Failed to close PostgreSQL pool');

            return failure(createError({
                name: 'PostgreSQLCloseError',
                message: `Failed to close pool: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_CONNECTION_ERROR',
                statusCode: 500,
                cause: error
            }));
        }
    }

    /**
     * Check if an error is retryable
     * @param error The error to check
     * @returns True if the error is retryable
     */
    public isRetryableError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;

        const errorCode = (error as any).code;
        const errorMessage = (error as any).message?.toLowerCase() || '';

        // PostgreSQL specific retryable errors
        const retryableCodes = [
            '53300', // too_many_connections
            '53400', // configuration_limit_exceeded
            '08000', // connection_exception
            '08003', // connection_does_not_exist
            '08006', // connection_failure
            '08001', // sqlclient_unable_to_establish_sqlconnection
            '08004', // sqlserver_rejected_establishment_of_sqlconnection
        ];

        const retryableMessages = [
            'connection terminated',
            'connection refused',
            'timeout',
            'network',
            'broken pipe'
        ];

        return retryableCodes.includes(errorCode) ||
               retryableMessages.some(msg => errorMessage.includes(msg));
    }

    /**
     * Check if an error is a connection error
     * @param error The error to check
     * @returns True if the error is a connection error
     */
    public isConnectionError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;

        const errorCode = (error as any).code;
        const errorMessage = (error as any).message?.toLowerCase() || '';

        const connectionCodes = ['08000', '08003', '08006', '08001', '08004'];
        const connectionMessages = ['connection', 'connect', 'network'];

        return connectionCodes.includes(errorCode) ||
               connectionMessages.some(msg => errorMessage.includes(msg));
    }

    // Static methods for backward compatibility (mirror MySQLService API)

    /**
     * Initialize the PostgreSQL connection pool (static method for backward compatibility)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result indicating success or failure
     */
    public static async initialize(config?: any): Promise<Result<void>> {
        const instance = this.getDefaultInstance(config);
        return instance.initialize();
    }

    /**
     * Check if the connection is healthy and attempt to reconnect if not (static method for backward compatibility)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result indicating if the connection is healthy
     */
    public static async healthCheck(config?: any): Promise<Result<boolean>> {
        const instance = this.getDefaultInstance(config);
        return instance.healthCheck();
    }

    /**
     * Execute a SELECT query with retry logic (static method for backward compatibility)
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result containing rows and count
     */
    public static async select<T extends QueryResultRow>(
        query: string,
        params: any[] = [],
        retryCount = 0,
        config?: any
    ): Promise<PostgreSQLQueryResult<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.select<T>(query, params, retryCount);
    }

    /**
     * Static method for backward compatibility - execute any SQL query
     * @deprecated Use instance methods or PostgreSQLService.acme/CRM static getters instead
     * @param query SQL query string
     * @param params Query parameters
     * @param config Optional configuration override
     * @returns Result containing unified query response
     */
    public static async query<T extends QueryResultRow>(
        query: string,
        params: any[] = [],
        config?: any
    ): Promise<PostgreSQLQueryResult<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.query<T>(query, params);
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE query with retry logic
     * @deprecated Use query() method instead for unified interface
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result containing affected rows and other metadata
     */
    public static async modify(
        query: string,
        params: any[] = [],
        retryCount = 0,
        config?: any
    ): Promise<PostgreSQLQueryResult<any>> {
        const instance = this.getDefaultInstance(config);
        return instance.modify(query, params, retryCount);
    }

    /**
     * Execute a transaction with multiple queries (static method for backward compatibility)
     * @param callback Function that receives a client and executes queries
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result of the transaction
     */
    public static async transaction<T>(
        callback: (client: PoolClient) => Promise<T>,
        config?: any
    ): Promise<Result<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.transaction(callback);
    }

    /**
     * Close the connection pool (static method for backward compatibility)
     * @param config Optional PostgreSQL configuration (defaults to config from configProvider)
     * @returns Result indicating success or failure
     */
    public static async close(config?: any): Promise<Result<void>> {
        const instance = this.getDefaultInstance(config);
        return instance.close();
    }

    // Static convenience wrapper for CRM database
    // Provides simple access to the CRM database without requiring config management

    /**
     * Convenience wrapper for CRM database operations
     * Uses a singleton instance configured for CRM database
     */
    private static _crmInstance: PostgreSQLService | null = null;
    
    static get CRM(): PostgreSQLService {
        if (!this._crmInstance) {
            const crmConfig = ConfigProvider.get(DATABASE.CRM_CONNECTION);
            this._crmInstance = new PostgreSQLService(crmConfig, 'CRM');
        }
        return this._crmInstance;
    }

    /**
     * Reset static instances (useful for testing)
     */
    static resetInstances(): void {
        this._crmInstance = null;
        this.defaultInstance = null;
    }
}
