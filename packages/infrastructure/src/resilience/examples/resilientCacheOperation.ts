/**
 * Example of a resilient cache operation using the enhanced ObservableFunction
 * 
 * This module demonstrates how to use the enhanced ObservableFunction with alerting
 * capabilities to implement resilient cache operations.
 */

import { ApplicationContext, Result, success, failure, createError } from '@platform/core';
import { createObservableFunction } from '../templates';
import { AlertService, AlertSeverity } from '../alerting';

/**
 * Creates a resilient cache operation function
 * 
 * @param context Application context
 * @param operationName Name of the cache operation
 * @param cacheName Name of the cache (e.g., "Redis", "In-Memory")
 * @param operationFn The cache operation function to wrap
 * @param options Optional configuration options
 * @returns A function that returns a Promise<Result<T>>
 */
export function createResilientCacheOperation<T>(
    context: ApplicationContext,
    operationName: string,
    cacheName: string,
    operationFn: () => Promise<Result<T>>,
    options?: {
        maxRetries?: number;
        circuitBreakerTimeout?: number;
        alertOnFailure?: boolean;
    }
): () => Promise<Result<T>> {
    // Create alert service
    const alertService = new AlertService({
        serviceName: context.identity.appName,
        environment: process.env.NODE_ENV || 'development'
    });
    
    // Default options
    const maxRetries = options?.maxRetries ?? 2;
    const circuitBreakerTimeout = options?.circuitBreakerTimeout ?? 2000;
    const alertOnFailure = options?.alertOnFailure ?? true;
    
    // Create observable function with alerting
    return createObservableFunction({
        context,
        operationName,
        serviceName: `${context.identity.appName}.cache`,
        additionalAttributes: {
            'cache.name': cacheName,
            'operation.type': 'cache'
        },
        alertService,
        sidecarFeatures: {
            circuitBreaker: true,
            retry: true,
            metrics: true,
            spans: true,
            alerting: true
        },
        circuitBreakerConfig: {
            enabled: true,
            timeout: circuitBreakerTimeout,
            errorThresholdPercentage: 50,
            resetTimeout: 10000,
            name: `${cacheName}-${operationName}`
        },
        retryConfig: {
            enabled: true,
            retries: maxRetries,
            minTimeout: 50,
            maxTimeout: 500,
            factor: 2
        },
        alertConfig: {
            enabled: true,
            resourceName: cacheName,
            alertOnCircuitOpen: true,
            alertOnRetryFailure: alertOnFailure,
            alertOnOperationFailure: alertOnFailure
        }
    }, operationFn);
}

/**
 * Example usage with Redis cache:
 * 
 * ```typescript
 * // Create a resilient cache get function
 * const getFromCache = createResilientCacheOperation(
 *   appContext,
 *   'getIntent',
 *   'Redis',
 *   async () => {
 *     try {
 *       const value = await redisClient.get(key);
 *       if (!value) {
 *         return failure(createError({
 *           type: 'CacheMiss',
 *           message: `Cache miss for key: ${key}`,
 *           statusCode: 404
 *         }));
 *       }
 *       return success(JSON.parse(value));
 *     } catch (error) {
 *       return failure(createError({
 *         type: 'CacheError',
 *         message: `Failed to get from cache: ${error.message}`,
 *         statusCode: 500,
 *         cause: error
 *       }));
 *     }
 *   }
 * );
 * 
 * // Use the resilient function
 * const result = await getFromCache();
 * if (result.success) {
 *   console.log('Cache value:', result.value);
 * } else if (result.error?.type === 'CacheMiss') {
 *   console.log('Value not in cache');
 * } else {
 *   console.error('Cache error:', result.error);
 * }
 * ```
 * 
 * Example with fallback to in-memory cache:
 * 
 * ```typescript
 * // Create a resilient cache get function with fallback
 * const getFromCacheWithFallback = createResilientCacheOperation(
 *   appContext,
 *   'getIntentWithFallback',
 *   'Redis',
 *   async () => {
 *     try {
 *       const value = await redisClient.get(key);
 *       if (value) {
 *         return success(JSON.parse(value));
 *       }
 *       
 *       // Fallback to in-memory cache
 *       const memoryValue = inMemoryCache.get(key);
 *       if (memoryValue) {
 *         return success(memoryValue);
 *       }
 *       
 *       return failure(createError({
 *         type: 'CacheMiss',
 *         message: `Cache miss for key: ${key} (both Redis and in-memory)`,
 *         statusCode: 404
 *       }));
 *     } catch (error) {
 *       // On Redis error, try in-memory cache
 *       const memoryValue = inMemoryCache.get(key);
 *       if (memoryValue) {
 *         return success(memoryValue);
 *       }
 *       
 *       return failure(createError({
 *         type: 'CacheError',
 *         message: `Failed to get from cache: ${error.message}`,
 *         statusCode: 500,
 *         cause: error
 *       }));
 *     }
 *   }
 * );
 * ```
 */
