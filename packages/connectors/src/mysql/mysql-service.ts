/**
 * MySQLService - Resilient MySQL Database Integration
 *
 * This service provides a robust, observable, and configurable interface for interacting with
 * MySQL databases in Blueprint applications. It manages connection pooling, transaction support,
 * error handling, and integrates with the Result pattern for consistent error propagation.
 *
 * Key features:
 * - Instance-based design for multiple database support
 * - Connection pooling for efficient resource usage
 * - Transaction management with rollback on error
 * - Typed query and modification result interfaces
 * - Comprehensive error handling using the Result pattern
 * - Integration with Blueprint configuration and observability systems
 *
 * This service is used by data access layers, batch processors, and other infrastructure components
 * requiring reliable, maintainable MySQL database access.
 *
 * @module infrastructure/datastores/mysql/mySQLService
 */
import * as mysql from 'mysql2/promise';
import {Pool, PoolConnection, ResultSetHeader, RowDataPacket} from 'mysql2/promise';
import {createError, failure, Result, success, ApplicationContext} from '@platform/core';
import {logger} from '@platform/core';
import {ConfigProvider, DATABASE} from '@platform/configuration';
import {createDatabaseObservable} from '@platform/infrastructure';


export type MySQLRowDataPacket = RowDataPacket;

/**
 * MySQL configuration interface
 */
export interface MySQLConfig {
    host: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    connectionLimit?: number;
    maxRetries?: number;
    retryDelayMs?: number;
}

/**
 * MySQL operation result data (used within Result<T> pattern)
 */
export interface MySQLQueryData<T = any> {
    rows: T[];           // Always present (empty array if no rows returned)
    rowCount: number;    // Number of rows returned in result set
    affectedRows: number; // Rows affected by INSERT/UPDATE/DELETE operations
    insertId?: number;   // Last insert ID (for INSERT operations)
    changedRows?: number; // Rows actually changed (for UPDATE operations)
}

/**
 * @deprecated Use Result<MySQLQueryData<T>> instead
 * Legacy interface for backward compatibility
 */
export interface QueryResult<T = any> {
    success: boolean;
    rows: T[];           // Always present (empty array if no rows returned)
    rowCount: number;    // Number of rows returned in result set
    affectedRows: number; // Rows affected by INSERT/UPDATE/DELETE operations
    insertId?: number;   // Last insert ID (for INSERT operations)
    changedRows?: number; // Rows actually changed (for UPDATE operations)
    error?: any;         // Only present on failure
}

/**
 * MySQL Service for interacting with MySQL 5.7 databases
 * Provides a facade over direct MySQL calls with error handling and retry logic
 * 
 * Now supports both instance-based and static usage for multiple database support
 */
export class MySQLService {
    // Instance properties
    private pool: Pool | null = null;
    private config: MySQLConfig;
    private isInitialized = false;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private readonly instanceId: string;
    
    // Static properties for backward compatibility
    private static defaultInstance: MySQLService | null = null;

    /**
     * Create a new MySQLService instance
     * @param config MySQL configuration
     * @param instanceId Optional unique identifier for this instance
     */
    constructor(config: MySQLConfig, instanceId?: string) {
        // Normalize configuration to handle both property name formats
        // Support both 'user'/'username' and 'database'/'dbname'
        this.config = {
            host: config.host,
            port: config.port,
            user: (config as any).user || (config as any).username,
            password: config.password,
            database: (config as any).database || (config as any).dbname,
            connectionLimit: config.connectionLimit,
            maxRetries: config.maxRetries,
            retryDelayMs: config.retryDelayMs
        };

        this.instanceId = instanceId || `mysql-${Date.now()}`;
        this.maxRetries = config?.maxRetries || 3;
        this.retryDelayMs = config?.retryDelayMs || 1000;
    }

    /**
     * Get the default static instance (for backward compatibility)
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     */
    private static getDefaultInstance(config?: any): MySQLService {
        if (!this.defaultInstance) {
            const mysqlConfig = config || ConfigProvider.get(DATABASE.CALLS_CONNECTION);
            if (!mysqlConfig) {
                throw new Error('MySQL configuration not found');
            }
            this.defaultInstance = new MySQLService(mysqlConfig, 'default');
        }
        return this.defaultInstance;
    }

    /**
     * Initialize the MySQL connection pool
     * @returns Result indicating success or failure
     */
    public async initialize(): Promise<Result<void>> {
        if (this.isInitialized && this.pool) {
            return success(undefined);
        }

        try {
            // Create pool without testing connection to avoid circular dependency
            this.pool = mysql.createPool({
                host: this.config.host,
                port: this.config.port || 3306,
                user: this.config.user,
                password: this.config.password,
                database: this.config.database,
                connectionLimit: this.config.connectionLimit || 10
            });

            // Mark as initialized immediately after pool creation
            this.isInitialized = true;
            
            logger.info({ 
                instanceId: this.instanceId,
                host: this.config.host,
                database: this.config.database
            }, `MySQL connection pool created successfully`);

            // Test connection separately (optional - don't fail initialization if this fails)
            try {
                const connection = await this.pool.getConnection();
                connection.release();
                logger.info({ 
                    instanceId: this.instanceId
                }, `MySQL connection test successful`);
            } catch (testError) {
                logger.warn({
                    instanceId: this.instanceId,
                    testError: testError instanceof Error ? testError.message : String(testError)
                }, `MySQL connection test failed, but pool is created`);
                // Don't fail initialization - let queries handle connection issues with retry logic
            }
            
            return success(undefined);
        } catch (error) {
            // Reset state on pool creation failure
            this.isInitialized = false;
            this.pool = null;
            
            // Enhanced diagnostic information for configuration issues
            const configDiagnostics = {
                instanceId: this.instanceId,
                configKeys: Object.keys(this.config || {}),
                configValues: {
                    host: this.config?.host || 'MISSING',
                    port: this.config?.port || 'MISSING', 
                    user: this.config?.user || 'MISSING',
                    database: this.config?.database || 'MISSING',
                    password: this.config?.password ? '[PRESENT]' : 'MISSING',
                    connectionLimit: this.config?.connectionLimit || 'MISSING'
                },
                rawConfigType: typeof this.config,
                rawConfigIsNull: this.config === null,
                rawConfigIsUndefined: this.config === undefined,
                rawConfigStringified: this.config ? JSON.stringify(this.config, (key, value) => 
                    key === 'password' ? '[REDACTED]' : value, 2) : 'null/undefined'
            };
            
            logger.error({
                error,
                ...configDiagnostics
            }, 'Failed to create MySQL connection pool - Enhanced Diagnostics');
            return failure(createError({
                name: 'MySQLInitializationError',
                message: `Failed to initialize MySQL connection: ${error instanceof Error ? error.message : String(error)}`,
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
                name: 'MySQLConnectionError',
                message: 'MySQL pool not initialized',
                type: 'DATABASE_CONNECTION_ERROR',
                statusCode: 500
            }));
        }

        return success(this.pool);
    }

    /**
     * Check if the MySQL connection is healthy
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

            // Test connection with a simple query
            const testResult = await this.query('SELECT 1 as test');
            if (testResult.success) {
                logger.debug({ instanceId: this.instanceId }, 'Health check passed');
                return success(true);
            } else {
                logger.warn({
                    instanceId: this.instanceId,
                    error: testResult.error
                }, 'Health check failed - test query failed');
                
                // Reset pool state on health check failure
                this.isInitialized = false;
                this.pool = null;
                
                return failure(testResult.error || createError({
                    name: 'MySQLHealthCheckError',
                    message: 'Health check query failed',
                    type: 'DATABASE_ERROR',
                    statusCode: 500
                }));
            }
        } catch (error) {
            logger.error({
                instanceId: this.instanceId,
                error
            }, 'Health check failed with exception');
            
            // Reset pool state on exception
            this.isInitialized = false;
            this.pool = null;
            
            return failure(createError({
                name: 'MySQLHealthCheckError',
                message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_ERROR',
                statusCode: 500,
                cause: error
            }));
        }
    }

    /**
     * Create application context for observability
     */
    private createContext(operation: string, additionalMetadata?: any): ApplicationContext {
        return {
            identity: {
                appName: 'database',
                namespace: 'mysql',
                integration: this.instanceId,
                operation: operation
            },
            tenantId: `mysql-${this.instanceId}-${operation}`,
            globalConfigs: {
                instanceId: this.instanceId,
                database: this.config.database,
                host: this.config.host,
                operation,
                ...additionalMetadata
            }
        };
    }

    /**
     * Extract query type from SQL for better observability context
     */
    private getQueryType(query: string): string {
        const trimmed = query.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) return 'SELECT';
        if (trimmed.startsWith('INSERT')) return 'INSERT';
        if (trimmed.startsWith('UPDATE')) return 'UPDATE';
        if (trimmed.startsWith('DELETE')) return 'DELETE';
        if (trimmed.startsWith('CALL')) return 'PROCEDURE';
        return 'UNKNOWN';
    }

    /**
     * Core query implementation (without observability)
     */
    private async queryCore<T = any>(
        query: string,
        params: any[] = []
    ): Promise<QueryResult<T>> {
        let retryCount = 0;
        
        while (retryCount <= this.maxRetries) {
            const poolResult = await this.getPool();
            if (!poolResult.success) {
                if (retryCount === this.maxRetries) {
                    logger.error({
                        error: poolResult.error,
                        query,
                        params,
                        retryCount,
                        instanceId: this.instanceId
                    }, 'Query failed - max retries exceeded for pool initialization');
                    return {
                        success: false,
                        rows: [],
                        rowCount: 0,
                        affectedRows: 0,
                        error: poolResult.error
                    };
                }
                
                logger.warn({
                    error: poolResult.error,
                    instanceId: this.instanceId
                }, `Pool initialization failed, retrying (attempt ${retryCount + 1}/${this.maxRetries})`);
                
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
                continue;
            }

            const pool = poolResult.data;
            let connection: PoolConnection | null = null;

            try {
                connection = await pool.getConnection();
                const [result, fields] = await connection.query(query, params);

                // Handle different result types from MySQL
                if (Array.isArray(result)) {
                    // SELECT queries or stored procedures returning result sets
                    if (result.length > 0 && Array.isArray(result[0])) {
                        // Stored procedure with multiple result sets - take the first one
                        const rows = result[0] as T[];
                        return {
                            success: true,
                            rows,
                            rowCount: rows.length,
                            affectedRows: 0
                        };
                    } else {
                        // Regular SELECT or single result set
                        const rows = result as T[];
                        return {
                            success: true,
                            rows,
                            rowCount: rows.length,
                            affectedRows: 0
                        };
                    }
                } else if (result && typeof result === 'object' && 'affectedRows' in result) {
                    // INSERT/UPDATE/DELETE operations
                    const modifyResult = result as ResultSetHeader;
                    return {
                        success: true,
                        rows: [],
                        rowCount: 0,
                        affectedRows: modifyResult.affectedRows,
                        insertId: modifyResult.insertId,
                        changedRows: modifyResult.changedRows
                    };
                } else {
                    // Unexpected result format - return empty success
                    return {
                        success: true,
                        rows: [],
                        rowCount: 0,
                        affectedRows: 0
                    };
                }
            } catch (error) {
                // Check if we should retry
                if (this.isRetryableError(error) && retryCount < this.maxRetries) {
                    logger.warn(
                        {error, query, params, retryCount: retryCount + 1, instanceId: this.instanceId},
                        `Query failed, retrying (attempt ${retryCount + 1}/${this.maxRetries})`
                    );

                    // Reset pool state for retry
                    this.isInitialized = false;
                    this.pool = null;
                    
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
                    continue;
                }

                logger.error({
                    error, 
                    query, 
                    params, 
                    retryCount,
                    instanceId: this.instanceId
                }, 'Query failed - max retries exceeded');
                return {
                    success: false,
                    rows: [],
                    rowCount: 0,
                    affectedRows: 0,
                    error: createError({
                        name: 'MySQLQueryError',
                        message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
                        type: 'DATABASE_ERROR',
                        statusCode: 500,
                        cause: error
                    })
                };
            } finally {
                if (connection !== null && connection !== undefined) {
                    connection.release();
                }
            }
        }
        
        // This should never be reached, but included for completeness
        return {
            success: false,
            rows: [],
            rowCount: 0,
            affectedRows: 0,
            error: createError({
                name: 'MySQLQueryError',
                message: 'Unexpected end of retry loop',
                type: 'DATABASE_ERROR',
                statusCode: 500
            })
        };
    }

    /**
     * Execute any SQL query (SELECT, INSERT, UPDATE, DELETE, stored procedures) with observability
     * This is the main public method that wraps the core implementation with automatic observability
     * @param query SQL query string or stored procedure call
     * @param params Query parameters
     * @returns Result containing unified query response
     */
    async query<T = any>(
        query: string,
        params: any[] = []
    ): Promise<QueryResult<T>> {
        const context = this.createContext('query', {
            queryType: this.getQueryType(query),
            paramCount: params.length
        });

        const observableQuery = createDatabaseObservable(
            context,
            'mysql.query',
            async () => {
                const result = await this.queryCore<T>(query, params);
                // Return the QueryResult directly - the observability wrapper expects Result<QueryResult>
                return result.success 
                    ? success(result)
                    : failure(result.error);
            }
        );

        const observableResult = await observableQuery();
        // The observableResult is a Result<QueryResult>, so we extract the QueryResult
        if (observableResult.success) {
            return observableResult.data; // This is the QueryResult
        } else {
            // On failure, create a failed QueryResult from the error
            return {
                success: false,
                error: observableResult.error,
                rows: [],
                rowCount: 0,
                affectedRows: 0
            };
        }
    }

    /**
     * Execute any SQL query with standardized Result<T> pattern
     * This is the modern method that follows Result<T> pattern for consistency
     * @param query SQL query string or stored procedure call
     * @param params Query parameters
     * @returns Result<MySQLQueryData<T>> following standard Result pattern
     */
    async executeQuery<T = any>(
        query: string,
        params: any[] = []
    ): Promise<Result<MySQLQueryData<T>>> {
        const context = this.createContext('executeQuery', {
            queryType: this.getQueryType(query),
            paramCount: params.length
        });

        const observableQuery = createDatabaseObservable(
            context,
            'mysql.executeQuery',
            async () => {
                const result = await this.queryCore<T>(query, params);
                if (result.success) {
                    // Convert QueryResult to MySQLQueryData (remove success field)
                    const queryData: MySQLQueryData<T> = {
                        rows: result.rows,
                        rowCount: result.rowCount,
                        affectedRows: result.affectedRows,
                        insertId: result.insertId,
                        changedRows: result.changedRows
                    };
                    
                    // Use meaningful status codes for resilience layer
                    if (result.rowCount === 0 && result.affectedRows === 0 && this.getQueryType(query) === 'SELECT') {
                        // SELECT query with no results - this is often expected (noop)
                        return success(queryData, 204, "No matching records found");
                    } else if (result.affectedRows === 0 && ['UPDATE', 'DELETE'].includes(this.getQueryType(query))) {
                        // UPDATE/DELETE with no affected rows - noop
                        return success(queryData, 204, "No records modified");
                    } else {
                        // Normal successful operation
                        return success(queryData, 200);
                    }
                } else {
                    // Enhance error with retryable flag and proper error type
                    const enhancedError = createError({
                        message: result.error?.message || 'Database operation failed',
                        type: this.categorizeError(result.error),
                        statusCode: result.error?.statusCode || 500,
                        retryable: this.isRetryableError(result.error),
                        cause: result.error
                    });
                    return failure(enhancedError);
                }
            }
        );

        return observableQuery();
    }

    /**
     * Execute a SELECT query with retry logic
     * @deprecated Use executeQuery() method instead for standardized Result<T> pattern
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @returns Result containing rows and count
     */
    public async select<T extends RowDataPacket = RowDataPacket>(
        query: string,
        params: any[] = [],
        retryCount = 0
    ): Promise<QueryResult<T>> {
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
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<T[]>(query, params);
            return {
                success: true,
                rows,
                rowCount: rows.length,
                affectedRows: 0
            };
        } catch (error) {
            // Check if we should retry
            if (this.isRetryableError(error) && retryCount < this.maxRetries) {
                logger.warn(
                    {error, query, params, retryCount: retryCount + 1},
                    `Retrying SELECT query after error (attempt ${retryCount + 1}/${this.maxRetries})`
                );

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));

                // Remove bad pool and retry
                this.isInitialized = false;
                this.pool = null;
                
                return this.select<T>(query, params, retryCount + 1);
            }

            logger.error({error, query, params}, 'SELECT query failed');

            return {
                success: false,
                rows: [],
                rowCount: 0,
                affectedRows: 0,
                error: createError({
                    name: 'MySQLSelectError',
                    message: `SELECT query failed: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'DATABASE_QUERY_ERROR',
                    statusCode: 500,
                    cause: error
                })
            };

        } finally {
            if (connection !== null && connection !== undefined) {
                connection.release();
            }
        }
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
    ): Promise<QueryResult<any>> {
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
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            const [result] = await connection.query<ResultSetHeader>(query, params)
            return {
                success: true,
                rows: [],
                rowCount: 0,
                affectedRows: result.affectedRows,
                insertId: result.insertId,
                changedRows: result.changedRows
            };
        } catch (error) {
            // Check if we should retry
            if (this.isRetryableError(error) && retryCount < this.maxRetries) {
                logger.warn(
                    {error, query, params, retryCount: retryCount + 1},
                    `Retrying modification query after error (attempt ${retryCount + 1}/${this.maxRetries})`
                );

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));

                // Remove bad pool and retry
                this.isInitialized = false;
                this.pool = null;
                return this.modify(query, params, retryCount + 1);
            }

            logger.error({error, query, params}, 'Modification query failed');
            return {
                success: false,
                rows: [],
                rowCount: 0,
                affectedRows: 0,
                error: createError({
                    name: 'MySQLSelectError',
                    message: `SELECT query failed: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'DATABASE_QUERY_ERROR',
                    statusCode: 500,
                    cause: error
                })
            };

        } finally {
            if (connection !== null && connection !== undefined) {
                connection.release();
            }
        }
    }

    /**
     * Execute a transaction with multiple queries
     * @param callback Function that receives a connection and executes queries
     * @returns Result of the transaction
     */
    public async transaction<T>(
        callback: (connection: PoolConnection) => Promise<T>
    ): Promise<Result<T>> {
        const poolResult = await this.getPool();
        if (!poolResult.success) {
            return failure(poolResult.error);
        }

        const pool = poolResult.data;
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const result = await callback(connection);

            await connection.commit();
            return success(result);
        } catch (error) {
            if (connection !== null && connection !== undefined) {
                await connection.rollback();
            }

            logger.error({error}, 'Transaction failed');

            return failure(createError({
                name: 'MySQLTransactionError',
                message: `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_TRANSACTION_ERROR',
                statusCode: 500,
                cause: error
            }));
        } finally {
            if (connection !== null && connection !== undefined) {
                connection.release();
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
                logger.info({ instanceId: this.instanceId }, 'MySQL connection pool closed');
            }
            return success(undefined);
        } catch (error) {
            logger.error({error, instanceId: this.instanceId}, 'Failed to close MySQL connection pool');
            return failure(createError({
                name: 'MySQLCloseError',
                message: `Failed to close MySQL connection: ${error instanceof Error ? error.message : String(error)}`,
                type: 'DATABASE_CONNECTION_ERROR',
                statusCode: 500,
                cause: error
            }));
        }
    }

    /**
     * Categorize error for resilience layer decision making
     */
    private categorizeError(error: any): string {
        if (!error) return 'DATABASE_ERROR';
        
        const message = error.message?.toLowerCase() || '';
        const code = error.code?.toLowerCase() || '';
        
        // Connection and timeout errors
        if (message.includes('timeout') || code.includes('timeout')) {
            return 'TIMEOUT';
        }
        
        // Connection errors
        if (message.includes('connection') || code === 'econnrefused' || code === 'enotfound') {
            return 'DATABASE_ERROR';
        }
        
        // Authentication errors
        if (message.includes('access denied') || code === 'er_access_denied_error') {
            return 'UNAUTHORIZED';
        }
        
        // Validation/constraint errors
        if (message.includes('duplicate entry') || code === 'er_dup_entry') {
            return 'CONFLICT';
        }
        
        if (message.includes('constraint') || message.includes('foreign key')) {
            return 'VALIDATION_ERROR';
        }
        
        // Default to database error
        return 'DATABASE_ERROR';
    }

    /**
     * Check if an error is retryable
     * @param error The error to check
     * @returns True if the error is retryable
     */
    private isRetryableError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        // Common MySQL error codes that are retryable
        const retryableErrorCodes = [
            'PROTOCOL_CONNECTION_LOST',
            'ER_LOCK_DEADLOCK',
            'ER_LOCK_WAIT_TIMEOUT',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ECONNRESET'
        ];

        return retryableErrorCodes.some(code => error.message.includes(code));
    }

    /**
     * Check if an error is a connection error
     * @param error The error to check
     * @returns True if the error is a connection error
     */
    private isConnectionError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        // Common MySQL connection error codes
        const connectionErrorCodes = [
            'PROTOCOL_CONNECTION_LOST',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ECONNRESET'
        ];

        return connectionErrorCodes.some(code => error.message.includes(code));
    }

    /**
     * Initialize the MySQL connection pool (static method for backward compatibility)
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     * @returns Result indicating success or failure
     */
    public static async initialize(config?: any): Promise<Result<void>> {
        const instance = this.getDefaultInstance(config);
        return instance.initialize();
    }

    /**
     * Check if the connection is healthy and attempt to reconnect if not (static method for backward compatibility)
     * @param config Optional MySQL configuration (defaults to config from configProvider)
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
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     * @returns Result containing rows and count
     */
    public static async select<T extends RowDataPacket = RowDataPacket>(
        query: string,
        params: any[] = [],
        retryCount = 0,
        config?: any
    ): Promise<QueryResult<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.select<T>(query, params, retryCount);
    }

    /**
     * Static method for backward compatibility - execute any SQL query
     * @deprecated Use instance methods or MySQLService.CALLS/CRM static getters instead
     * @param query SQL query string
     * @param params Query parameters
     * @param config Optional configuration override
     * @returns Result containing unified query response
     */
    public static async query<T = any>(
        query: string,
        params: any[] = [],
        config?: any
    ): Promise<QueryResult<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.query<T>(query, params);
    }

    /**
     * Static method with standardized Result<T> pattern
     * @param query SQL query string
     * @param params Query parameters
     * @param config Optional configuration override
     * @returns Result<MySQLQueryData<T>> following standard Result pattern
     */
    public static async executeQuery<T = any>(
        query: string,
        params: any[] = [],
        config?: any
    ): Promise<Result<MySQLQueryData<T>>> {
        const instance = this.getDefaultInstance(config);
        return instance.executeQuery<T>(query, params);
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE query with retry logic
     * @deprecated Use query() method instead for unified interface
     * @param query SQL query string
     * @param params Query parameters
     * @param retryCount Current retry attempt (used internally)
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     * @returns Result containing affected rows and other metadata
     */
    public static async modify(
        query: string,
        params: any[] = [],
        retryCount = 0,
        config?: any
    ): Promise<QueryResult<any>> {
        const instance = this.getDefaultInstance(config);
        return instance.modify(query, params, retryCount);
    }

    /**
     * Execute a transaction with multiple queries (static method for backward compatibility)
     * @param callback Function that receives a connection and executes queries
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     * @returns Result of the transaction
     */
    public static async transaction<T>(
        callback: (connection: PoolConnection) => Promise<T>,
        config?: any
    ): Promise<Result<T>> {
        const instance = this.getDefaultInstance(config);
        return instance.transaction(callback);
    }

    /**
     * Close the connection pool (static method for backward compatibility)
     * @param config Optional MySQL configuration (defaults to config from configProvider)
     * @returns Result indicating success or failure
     */
    public static async close(config?: any): Promise<Result<void>> {
        const instance = this.getDefaultInstance(config);
        return instance.close();
    }

    // Static convenience wrappers for specific databases
    // These provide simple access to the two known databases without requiring config management

    /**
     * Convenience wrapper for CRM database operations
     * Uses a singleton instance configured for CRM database
     */
    private static _crmInstance: MySQLService | null = null;
    
    static get CRM(): MySQLService {
        if (!this._crmInstance) {
            const crmConfig = ConfigProvider.get(DATABASE.CALLS_CONNECTION);
            this._crmInstance = new MySQLService(crmConfig, 'CRM');
        }
        return this._crmInstance;
    }

    /**
     * Convenience wrapper for CALLS database operations
     * Uses a singleton instance configured for CALLS database
     */
    private static _callsInstance: MySQLService | null = null;
    
    static get CALLS(): MySQLService {
        if (!this._callsInstance) {
            const callsConfig = ConfigProvider.get(DATABASE.CALLS_CONNECTION);
            this._callsInstance = new MySQLService(callsConfig, 'CALLS');
        }
        return this._callsInstance;
    }

    /**
     * Reset static instances (useful for testing)
     */
    static resetInstances(): void {
        this._crmInstance = null;
        this._callsInstance = null;
    }
}
