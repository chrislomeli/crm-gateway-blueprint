/**
 * HttpClientFunctional - Resilient HTTP Client (Functional Pattern)
 * 
 * This module provides a robust HTTP client implementation with built-in resilience
 * features for reliable communication with external HTTP APIs, using the functional
 * ObservableFunction pattern instead of class inheritance.
 * 
 * Key features:
 * - Built on ObservableFunction for resilience features
 *   (circuit breaker, retries, rate limiting)
 * - Distributed tracing integration
 * - Metrics collection for operational visibility
 * - Support for all standard HTTP methods
 * - Configurable timeouts and retry strategies
 * - Comprehensive error handling using the Result pattern
 * 
 * This connector follows the functional pattern used by MySQL and Elasticsearch
 * connectors, providing a consistent approach across all external system integrations.
 * 
 * @module connectors/http/HttpClientFunctional
 */

import axios, {AxiosInstance, AxiosRequestConfig, AxiosError} from 'axios';
import {ConfigProvider} from "@platform/configuration";
import {Result, failureFromError, success, ApplicationContext, createError, failure} from "@platform/core";
import {createDatabaseObservable} from "@platform/infrastructure";

/**
 * HTTP operation context for observability
 */
interface HttpOperationContext {
    method: string;
    url: string;
    baseUrl: string;
    timeout: number;
    hasData?: boolean;
}

/**
 * Configuration for the HTTP client
 */
export interface HttpClientConfig {
    baseUrl: string;
    timeout?: number;
    headers?: Record<string, string>;
    retries?: number;
    circuitBreaker?: boolean;
}

/**
 * Creates a plain HTTP client with axios
 * 
 * @param config The HTTP client configuration
 * @returns An axios instance
 */
function createAxiosClient(config: HttpClientConfig): AxiosInstance {
    const opts = ConfigProvider.getRaw('httpClient.axios') || {};
    
    return axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeout || opts?.timeout || 10000,
        headers: config.headers || {}
    });
}

/**
 * Categorizes HTTP errors for resilience layer decision making
 * 
 * @param error The error from axios
 * @returns A structured ResultError with proper categorization
 */
function categorizeHttpError(error: unknown): any {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const code = axiosError.code;
        
        // Timeout errors
        if (code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
            return createError({
                message: `HTTP request timeout: ${axiosError.message}`,
                type: 'TIMEOUT',
                statusCode: 408,
                retryable: true,
                cause: error
            });
        }
        
        // Connection errors
        if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
            return createError({
                message: `HTTP connection error: ${axiosError.message}`,
                type: 'HTTP_ERROR',
                statusCode: 503,
                retryable: true,
                cause: error
            });
        }
        
        // HTTP status-based categorization
        if (status) {
            if (status >= 500) {
                // Server errors - retryable
                return createError({
                    message: `HTTP ${status}: ${axiosError.message}`,
                    type: 'UPSTREAM_ERROR',
                    statusCode: status,
                    retryable: true,
                    cause: error
                });
            } else if (status === 429) {
                // Rate limiting - retryable with backoff
                return createError({
                    message: `Rate limit exceeded: ${axiosError.message}`,
                    type: 'RATE_LIMIT_ERROR',
                    statusCode: status,
                    retryable: true,
                    cause: error
                });
            } else if (status === 404) {
                // Not found - usually not retryable
                return createError({
                    message: `Resource not found: ${axiosError.message}`,
                    type: 'NOT_FOUND',
                    statusCode: status,
                    retryable: false,
                    cause: error
                });
            } else if (status === 401) {
                // Unauthorized - not retryable
                return createError({
                    message: `Unauthorized: ${axiosError.message}`,
                    type: 'UNAUTHORIZED',
                    statusCode: status,
                    retryable: false,
                    cause: error
                });
            } else if (status === 400) {
                // Bad request - not retryable
                return createError({
                    message: `Bad request: ${axiosError.message}`,
                    type: 'BAD_REQUEST',
                    statusCode: status,
                    retryable: false,
                    cause: error
                });
            }
        }
        
        // Default HTTP error
        return createError({
            message: `HTTP error: ${axiosError.message}`,
            type: 'HTTP_ERROR',
            statusCode: status || 500,
            retryable: status ? status >= 500 : true,
            cause: error
        });
    }
    
    // Non-axios error
    return createError({
        message: error instanceof Error ? error.message : String(error),
        type: 'HTTP_ERROR',
        statusCode: 500,
        retryable: false,
        cause: error
    });
}

/**
 * Creates application context for HTTP operations
 * 
 * @param operationName The name of the HTTP operation
 * @param operationContext HTTP-specific context
 * @returns ApplicationContext for observability
 */
function createHttpContext(operationName: string, operationContext: HttpOperationContext): ApplicationContext {
    return {
        identity: {
            appName: 'http-client',
            namespace: 'connectors',
            integration: 'http',
            operation: operationName,
            runtime: {
                instanceId: process.env.INSTANCE_ID || 'unknown',
                hostname: process.env.HOSTNAME || 'localhost'
            }
        },
        globalConfigs: {
            httpOperation: operationContext
        }
    };
}

/**
 * Creates a functional HTTP client with resilience features
 * 
 * @param config The HTTP client configuration
 * @returns An object with HTTP methods that return Result objects
 */
export function createHttpClient(config: HttpClientConfig) {
    const axiosClient = createAxiosClient(config);
    
    /**
     * Generic send function for HTTP requests
     */
    async function send<T = any>(requestConfig: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: requestConfig.method || 'request',
            url: requestConfig.url || '',
            baseUrl: config.baseUrl,
            timeout: requestConfig.timeout || config.timeout || 10000,
            hasData: !!requestConfig.data
        };
        
        const context = createHttpContext(`send_${requestConfig.method || 'request'}`, operationContext);
        
        const observableSend = createDatabaseObservable(
            context,
            'http.send',
            async () => {
                try {
                    const response = await axiosClient(requestConfig);
                    
                    // Use meaningful status codes for resilience layer
                    if (response.status === 204) {
                        // No Content - successful noop
                        return success(response.data, 204, "No content returned");
                    } else if (response.status === 202) {
                        // Accepted - async operation
                        return success(response.data, 202, "Request accepted for processing");
                    } else {
                        // Normal successful response
                        return success(response.data, response.status);
                    }
                } catch (err) {
                    return failure(categorizeHttpError(err));
                }
            }
        );
        
        return observableSend();
    }
    
    /**
     * HTTP GET method
     */
    async function get<T = any>(url: string, requestConfig?: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: 'get',
            url,
            baseUrl: config.baseUrl,
            timeout: requestConfig?.timeout || config.timeout || 10000,
            hasData: false
        };
        
        const context = createHttpContext('get', operationContext);
        
        const observableGet = createDatabaseObservable(
            context,
            'http.get',
            async () => {
                return send<T>({ method: 'get', url, ...requestConfig });
            }
        );
        
        return observableGet();
    }
    
    /**
     * HTTP POST method
     */
    async function post<T = any>(url: string, data?: any, requestConfig?: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: 'post',
            url,
            baseUrl: config.baseUrl,
            timeout: requestConfig?.timeout || config.timeout || 10000,
            hasData: !!data
        };
        
        const context = createHttpContext('post', operationContext);
        
        const observablePost = createDatabaseObservable(
            context,
            'http.post',
            async () => {
                return send<T>({ method: 'post', url, data, ...requestConfig });
            }
        );
        
        return observablePost();
    }
    
    /**
     * HTTP PUT method
     */
    async function put<T = any>(url: string, data?: any, requestConfig?: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: 'put',
            url,
            baseUrl: config.baseUrl,
            timeout: requestConfig?.timeout || config.timeout || 10000,
            hasData: !!data
        };
        
        const context = createHttpContext('put', operationContext);
        
        const observablePut = createDatabaseObservable(
            context,
            'http.put',
            async () => {
                return send<T>({ method: 'put', url, data, ...requestConfig });
            }
        );
        
        return observablePut();
    }
    
    /**
     * HTTP PATCH method
     */
    async function patch<T = any>(url: string, data?: any, requestConfig?: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: 'patch',
            url,
            baseUrl: config.baseUrl,
            timeout: requestConfig?.timeout || config.timeout || 10000,
            hasData: !!data
        };
        
        const context = createHttpContext('patch', operationContext);
        
        const observablePatch = createDatabaseObservable(
            context,
            'http.patch',
            async () => {
                return send<T>({ method: 'patch', url, data, ...requestConfig });
            }
        );
        
        return observablePatch();
    }
    
    /**
     * HTTP DELETE method
     */
    async function del<T = any>(url: string, requestConfig?: AxiosRequestConfig): Promise<Result<T>> {
        const operationContext: HttpOperationContext = {
            method: 'delete',
            url,
            baseUrl: config.baseUrl,
            timeout: requestConfig?.timeout || config.timeout || 10000,
            hasData: false
        };
        
        const context = createHttpContext('delete', operationContext);
        
        const observableDelete = createDatabaseObservable(
            context,
            'http.delete',
            async () => {
                return send<T>({ method: 'delete', url, ...requestConfig });
            }
        );
        
        return observableDelete();
    }
    
    return {
        get,
        post,
        put,
        patch,
        delete: del,
        send
    };
}
