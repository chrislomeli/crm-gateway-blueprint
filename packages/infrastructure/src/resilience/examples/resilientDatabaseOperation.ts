/**
 * Example of a resilient database operation using the enhanced ObservableFunction
 * 
 * This module demonstrates how to use the enhanced ObservableFunction with alerting
 * capabilities to implement resilient database operations.
 */

import { ApplicationContext, Result, success, failure, createError } from '@platform/core';
import { createObservableFunction } from '../templates';
import { AlertService, AlertSeverity } from '../alerting';

/**
 * Creates a resilient database operation function
 * 
 * @param context Application context
 * @param operationName Name of the database operation
 * @param databaseName Name of the database (e.g., "MySQL", "Elasticsearch")
 * @param operationFn The database operation function to wrap
 * @returns A function that returns a Promise<Result<T>>
 */
export function createResilientDatabaseOperation<T>(
    context: ApplicationContext,
    operationName: string,
    databaseName: string,
    operationFn: () => Promise<Result<T>>
): () => Promise<Result<T>> {
    // Create alert service
    const alertService = new AlertService({
        serviceName: context.identity.appName,
        environment: process.env.NODE_ENV || 'development'
    });
    
    // Create observable function with alerting
    return createObservableFunction({
        context,
        operationName,
        serviceName: `${context.identity.appName}.database`,
        additionalAttributes: {
            'database.name': databaseName,
            'operation.type': 'database'
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
            timeout: 5000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
            name: `${databaseName}-${operationName}`
        },
        retryConfig: {
            enabled: true,
            retries: 3,
            minTimeout: 100,
            maxTimeout: 1000,
            factor: 2
        },
        alertConfig: {
            enabled: true,
            resourceName: databaseName,
            alertOnCircuitOpen: true,
            alertOnRetryFailure: true,
            alertOnOperationFailure: true
        }
    }, operationFn);
}

/**
 * Example usage:
 * 
 * ```typescript
 * // Create a resilient database query function
 * const getUserById = createResilientDatabaseOperation(
 *   appContext,
 *   'getUserById',
 *   'MySQL',
 *   async () => {
 *     try {
 *       const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *       return success(user);
 *     } catch (error) {
 *       return failure(createError({
 *         type: 'DatabaseError',
 *         message: `Failed to get user by ID: ${error.message}`,
 *         statusCode: 500,
 *         cause: error
 *       }));
 *     }
 *   }
 * );
 * 
 * // Use the resilient function
 * const result = await getUserById();
 * if (result.success) {
 *   console.log('User:', result.value);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
