/**
 * ObservableFunction - Functional approach to resilience and observability
 * 
 * This module provides a functional alternative to the Observable abstract class,
 * allowing developers to wrap any function with the same resilience and observability
 * features without requiring inheritance.
 * 
 * Key features:
 * - Circuit breaker pattern to prevent cascading failures
 * - Retry mechanisms with configurable backoff strategies
 * - Rate limiting to prevent overwhelming downstream publishing
 * - Distributed tracing integration with OpenTelemetry
 * - Metrics collection for operational visibility
 * - Standardized error handling using the Result pattern
 * 
 * @module infrastructure/resilience/templates/ObservableFunction
 */

import {createError, failure, getErrorInfo, Result, Severity, success} from '@platform/core';
import { logger } from '@platform/core';
import CircuitBreaker from 'opossum';
import { 
    ObservabilityFactory, 
    IMetricsProvider, 
    ITracingProvider, 
    ITracer, 
    SpanStatus
} from '../../observability';
import { ApplicationContext } from '@platform/core';
import { HealthChecker } from '../../health-checker';
import { IAlertService, AlertSeverity } from '../alerting';
import { createRateLimiter } from '../../rate-limiting';
import retry from 'async-retry';

/**
 * Determines the trace state based on Result statusCode for nuanced observability
 * 
 * @param result The Result object from the operation
 * @returns Trace state string: 'success', 'noop', 'accepted', or 'failed'
 */
function determineTraceState(result: Result<any>): string {
    if (!result.success) {
        return 'failed';
    }
    
    // Success cases with nuance based on statusCode
    switch (result.statusCode) {
        case 200:
        case 201:
            return 'success';
        case 204:
            return 'noop';        // No content / no-op operation
        case 202:
            return 'accepted';    // Async operation started
        default:
            return 'success';     // Default successful case
    }
}

// Duplicated interfaces (originally from Observable.ts) to break circular dependency
export interface ResourceMetrics {
    operationCounter: any;
    operationErrorCounter: any;
    operationDurationHistogram: any;
}

/**
 * Interface for circuit breaker options
 */
export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    name?: string;
}

// --- Sidecar Config Interfaces ---
export interface CircuitBreakerSidecarConfig extends CircuitBreakerOptions {
    enabled: boolean;
}

export interface RateLimiterSidecarConfig {
    enabled: boolean;
    maxConcurrent?: number;
    minTime?: number;
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
}

export interface TracerSidecarConfig {
    enabled: boolean;
    serviceName?: string;
    // Add more tracer config as needed
}

export interface RetrySidecarConfig {
    enabled: boolean;
    retries?: number;
    minTimeout?: number;
    maxTimeout?: number;
    factor?: number;
}

export interface MetricsSidecarConfig {
    enabled: boolean;
    serviceName?: string;
}

/**
 * Alert configuration for observable functions
 */
export interface AlertSidecarConfig {
    /**
     * Whether to enable alerting
     */
    enabled: boolean;
    
    /**
     * Resource name for alerts (e.g., "MySQL", "Redis", "Elasticsearch")
     */
    resourceName: string;
    
    /**
     * Minimum severity level for sending alerts
     */
    minimumSeverity?: AlertSeverity;
    
    /**
     * Whether to alert on circuit breaker open events
     */
    alertOnCircuitOpen?: boolean;
    
    /**
     * Whether to alert on retry failures
     */
    alertOnRetryFailure?: boolean;
    
    /**
     * Whether to alert on rate limiting events
     */
    alertOnRateLimiting?: boolean;
    
    /**
     * Whether to alert on operation failures
     */
    alertOnOperationFailure?: boolean;
}

/**
 * Configuration for an observable function
 */
export interface ObservableFunctionConfig {
    context: ApplicationContext;
    operationName: string;
    serviceName?: string;
    additionalAttributes?: Record<string, string>;
    metricsService?: IMetricsProvider;
    tracer?: ITracer;
    healthChecker?: HealthChecker;
    alertService?: IAlertService;
    sidecarFeatures?: {
        rateLimiting?: boolean;
        circuitBreaker?: boolean;
        retry?: boolean;
        metrics?: boolean;
        spans?: boolean;
        fallback?: boolean;
        alerting?: boolean;
    };
    circuitBreakerConfig?: CircuitBreakerSidecarConfig;
    rateLimiterConfig?: RateLimiterSidecarConfig;
    tracerConfig?: TracerSidecarConfig;
    retryConfig?: RetrySidecarConfig;
    metricsConfig?: MetricsSidecarConfig;
    alertConfig?: AlertSidecarConfig;
    fallbackProvider?: {
        handleFallback: (
            operationName: string,
            logContext: Record<string, any>,
            attributes: Record<string, string | number | boolean>,
            error: any
        ) => Promise<void>;
    };
}

/**
 * Creates an observable function that wraps a worker function with resilience and observability features
 * 
 * @param config Configuration for the observable function
 * @param workerFn The function to wrap
 * @returns A function that returns a Promise<Result<T>>
 */
export function createObservableFunction<T>(
    config: ObservableFunctionConfig,
    workerFn: () => Promise<Result<T>>
): () => Promise<Result<T>> {
    // Extract configuration
    const {
        context,
        operationName,
        serviceName = context.identity.appName,
        additionalAttributes = {},
        metricsService,
        tracer: providedTracer,
        healthChecker,
        alertService,
        sidecarFeatures = {
            rateLimiting: false,
            circuitBreaker: false,
            retry: false,
            metrics: true,
            spans: true,
            fallback: false,
            alerting: false
        },
        circuitBreakerConfig,
        rateLimiterConfig,
        retryConfig,
        alertConfig,
        fallbackProvider
    } = config;

    // Create resource attributes for both metrics and tracing
    const resourceAttributes = {
        'service.name': context.identity.appName,
        'service.namespace': context.identity.namespace,
        'service.instance.id': context.identity.runtime?.instanceId || 'unknown',
        'service.version': context.identity.version?.git?.shortHash || 'unknown',
        'host.name': context.identity.runtime?.hostname || 'unknown',
        'process.pid': String(process.pid),
        'git.commit': context.identity.version?.git?.commit || 'unknown',
        'git.branch': context.identity.version?.git?.branch || 'unknown',
        'deployment.environment': process.env.NODE_ENV || 'development',
        ...additionalAttributes
    };

    // Initialize tracer and metrics
    const tracer = providedTracer || ObservabilityFactory.getTracingProvider().getTracer('default-tracer');
    const meter = ObservabilityFactory.getMetricsProvider();

    // Initialize metrics for this operation
    const metrics: ResourceMetrics = {
        operationCounter: meter?.createCounter(`${operationName}.count`, `Number of ${serviceName}.${operationName} operations`) || {
            add: () => {}
        },
        operationErrorCounter: meter?.createCounter(`${operationName}.errors`, `Number of ${serviceName}.${operationName} errors`) || {
            add: () => {}
        },
        operationDurationHistogram: meter?.createHistogram(`${operationName}.duration`, `Duration of ${serviceName}.${operationName} operations`, 'ms') || {
            record: () => {}
        }
    };

    // Initialize circuit breaker if enabled
    let breaker: CircuitBreaker<any, any> | undefined;
    if (sidecarFeatures.circuitBreaker && circuitBreakerConfig?.enabled) {
        breaker = new CircuitBreaker(workerFn, {
            timeout: circuitBreakerConfig.timeout ?? 10000,
            errorThresholdPercentage: circuitBreakerConfig.errorThresholdPercentage ?? 50,
            resetTimeout: circuitBreakerConfig.resetTimeout ?? 30000,
            name: circuitBreakerConfig.name ?? serviceName ?? 'ResourceConnector',
        });

        // Event listeners for logging/metrics
        breaker.on('open', () => {
            logger?.warn({event: 'open', resource: serviceName}, '🔌 Circuit breaker OPEN');
            
            // Send alert for circuit breaker open if enabled
            if (sidecarFeatures.alerting && alertService && alertConfig?.enabled && alertConfig.alertOnCircuitOpen) {
                alertService.sendAlert(
                    AlertSeverity.ERROR,
                    `Circuit Breaker Open: ${operationName}`,
                    `Circuit breaker opened for operation ${operationName} on resource ${alertConfig.resourceName}`,
                    {
                        service: serviceName,
                        operation: operationName,
                        resource: alertConfig.resourceName,
                        errorType: 'CircuitBreakerOpen'
                    }
                ).catch(error => {
                    logger.error({}, `Failed to send circuit breaker alert: ${error instanceof Error ? error.message : String(error)}`);
                });
            }
        });
        breaker.on('halfOpen', () => {
            logger?.info({event: 'halfOpen', resource: serviceName}, '🤞 Circuit breaker HALF-OPEN');
        });
        breaker.on('close', () => {
            logger?.info({event: 'close', resource: serviceName}, '✅ Circuit breaker CLOSED');
        });
        breaker.on('failure', (err: any) => {
            logger?.error({event: 'failure', resource: serviceName, error: err}, '⚠️ Circuit breaker failure');
        });
    }

    // Initialize rate limiter if enabled
    let limiter: any;
    if (sidecarFeatures.rateLimiting && rateLimiterConfig?.enabled) {
        limiter = createRateLimiter({
            id: `${operationName}-rate-limiter`,
            maxConcurrent: rateLimiterConfig.maxConcurrent ?? 10,
            minTime: rateLimiterConfig.minTime ?? 100,
            redisHost: rateLimiterConfig.redisHost,
            redisPort: rateLimiterConfig.redisPort,
            redisPassword: rateLimiterConfig.redisPassword
        });
    }

    // Return the wrapped function
    return async function observableFunction(): Promise<Result<T>> {
        const span = tracer.startSpan(`${serviceName}.${operationName}`);
        const startTime = process.hrtime.bigint();
        
        try {
            // Record operation start in health monitoring
            // Health monitoring handled by health checker if available
            
            // Apply rate limiting if enabled
            let result: Result<T>;
            if (limiter && sidecarFeatures.rateLimiting) {
                try {
                    result = await limiter.schedule(workerFn);
                } catch (error) {
                    result = failure(createError({
                        type: 'RateLimited',
                        message: `Rate limited: ${error instanceof Error ? error.message : String(error)}`,
                        statusCode: 429,
                        cause: error instanceof Error ? error : new Error(String(error))
                    }));
                    
                    // Send alert for rate limiting if enabled
                    if (sidecarFeatures.alerting && alertService && alertConfig?.enabled && alertConfig.alertOnRateLimiting) {
                        alertService.sendAlert(
                            AlertSeverity.WARNING,
                            `Rate Limited: ${operationName}`,
                            `Operation ${operationName} on resource ${alertConfig.resourceName} was rate limited`,
                            {
                                service: serviceName,
                                operation: operationName,
                                resource: alertConfig.resourceName,
                                errorType: 'RateLimited',
                                errorMessage: error instanceof Error ? error.message : String(error)
                            }
                        ).catch(alertError => {
                            logger.error({}, `Failed to send rate limiting alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
                        });
                    }
                }
            } 
            // Apply circuit breaker if enabled
            else if (breaker && sidecarFeatures.circuitBreaker) {
                try {
                    result = await breaker.fire();
                } catch (error) {
                    result = failure(createError({
                        type: 'CircuitOpen',
                        message: `Circuit open: ${error instanceof Error ? error.message : String(error)}`,
                        statusCode: 503,
                        cause: error instanceof Error ? error : new Error(String(error))
                    }));
                }
            }
            // Apply retry if enabled
            else if (sidecarFeatures.retry && retryConfig?.enabled) {
                try {
                    result = await retry(workerFn, {
                        retries: retryConfig.retries ?? 3,
                        minTimeout: retryConfig.minTimeout ?? 100,
                        maxTimeout: retryConfig.maxTimeout,
                        factor: retryConfig.factor ?? 2,
                        onRetry: (err: unknown, attempt: number) => {
                            if (err instanceof Error) {
                                logger.warn({}, `Retry #${attempt}: ${err.message}`);
                            } else {
                                logger.warn({}, `Retry #${attempt}: ${String(err)}`);
                            }
                        },
                    });
                } catch (error) {
                    result = failure(createError({
                        type: 'RetryFailed',
                        message: `Retry failed: ${error instanceof Error ? error.message : String(error)}`,
                        statusCode: 500,
                        cause: error instanceof Error ? error : new Error(String(error))
                    }));
                    
                    // Send alert for retry failure if enabled
                    if (sidecarFeatures.alerting && alertService && alertConfig?.enabled && alertConfig.alertOnRetryFailure) {
                        alertService.sendCriticalOperationAlert(
                            operationName,
                            alertConfig.resourceName,
                            error,
                            {
                                service: serviceName,
                                errorType: 'RetryFailed',
                                retries: retryConfig.retries
                            }
                        ).catch(alertError => {
                            logger.error({}, `Failed to send retry failure alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
                        });
                    }
                }
            } 
            // Default execution
            else {
                result = await workerFn();
            }
            
            // Calculate duration
            const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to ms
            
            // Determine trace state based on Result statusCode
            const traceState = determineTraceState(result);
            
            // Record metrics with trace state
            if (sidecarFeatures.metrics) {
                const labels = { 
                    operation: operationName, 
                    service: serviceName,
                    trace_state: traceState
                };
                metrics.operationCounter.add(1, labels);
                metrics.operationDurationHistogram.record(duration, labels);
                
                if (!result.success) {
                    metrics.operationErrorCounter.add(1, {
                        ...labels,
                        error_type: result.error?.type || 'Unknown'
                    });
                }
            }
            
            // Enhanced span status with trace state
            if (sidecarFeatures.spans) {
                span.setAttributes({
                    'trace.state': traceState,
                    'result.status_code': result.statusCode || 0,
                    'result.message': result.message || '',
                    'operation.duration_ms': duration
                });
                switch (result.success) {

                    case false:
                        span.setStatus(SpanStatus.ERROR, getErrorInfo(result.error)?.message);
                        if (result.error) {
                            span.recordException(new Error(result.error.message));
                        }
                        break;

                    case true:
                        switch (traceState) {
                            case 'success':
                                span.setStatus(SpanStatus.OK);
                                break;
                            case 'noop':
                                span.setStatus(SpanStatus.OK);
                                span.addEvent('operation_noop', { reason: result.message || 'No operation performed' });
                                break;
                            case 'accepted':
                                span.setStatus(SpanStatus.OK);
                                span.addEvent('operation_accepted', { reason: result.message || 'Operation accepted for processing' });
                                break;
                        }
                }

            }
            
            // Record operation result in health monitoring
            // Health monitoring handled by health checker if available
            
            // Send alert for operation failure if enabled
            if (!result.success && sidecarFeatures.alerting && alertService && alertConfig?.enabled && alertConfig.alertOnOperationFailure) {
                alertService.sendCriticalOperationAlert(
                    operationName,
                    alertConfig.resourceName,
                    result.error,
                    {
                        service: serviceName,
                        duration
                    }
                ).catch(alertError => {
                    logger.error({}, `Failed to send operation failure alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
                });
            }
            
            // Handle fallback if enabled and operation failed
            if (sidecarFeatures.fallback && fallbackProvider && !result.success) {
                try {
                    await fallbackProvider.handleFallback(
                        operationName,
                        { service: serviceName },
                        { operation: operationName, service: serviceName },
                        result.error
                    );
                } catch (fallbackError) {
                    logger.error({}, `Fallback handler failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                }
            }
            
            return result;
        } catch (error) {
            // Calculate duration
            const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to ms
            
            // Record metrics for error
            if (sidecarFeatures.metrics) {
                const labels = { operation: operationName, service: serviceName };
                metrics.operationCounter.add(1, labels);
                metrics.operationDurationHistogram.record(duration, labels);
                metrics.operationErrorCounter.add(1, {
                    ...labels,
                    error_type: 'Exception'
                });
            }
            
            // Record operation failure in health monitoring
            // Health monitoring handled by health checker if available
            
            // Send alert for unexpected exception if enabled
            if (sidecarFeatures.alerting && alertService && alertConfig?.enabled) {
                alertService.sendCriticalOperationAlert(
                    operationName,
                    alertConfig.resourceName,
                    error,
                    {
                        service: serviceName,
                        errorType: 'UnhandledException',
                        duration
                    }
                ).catch(alertError => {
                    logger.error({}, `Failed to send exception alert: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
                });
            }
            
            // Handle fallback if enabled
            if (sidecarFeatures.fallback && fallbackProvider) {
                try {
                    await fallbackProvider.handleFallback(
                        operationName,
                        { service: serviceName },
                        { operation: operationName, service: serviceName },
                        error
                    );
                } catch (fallbackError) {
                    logger.error({}, `Fallback handler failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                }
            }
            
            return failure(createError({
                type: 'Internal',
                message: `Exception executing ${operationName}: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        } finally {
            // End span
            span.end();
        }
    };
}

/**
 * Creates and executes an observable function in one step
 * 
 * @param config Configuration for the observable function
 * @param workerFn The function to wrap and execute
 * @returns A Promise<Result<T>>
 */
export async function executeObservableFunction<T>(
    config: ObservableFunctionConfig,
    workerFn: () => Promise<Result<T>>
): Promise<Result<T>> {
    const observableFn = createObservableFunction(config, workerFn);
    return observableFn();
}

/**
 * Example usage:
 * 
 * ```typescript
 * // Create a reusable observable function
 * const getUser = createObservableFunction({
 *   context: appContext,
 *   operationName: 'getUser',
 *   sidecarFeatures: {
 *     circuitBreaker: true,
 *     retry: true
 *   },
 *   circuitBreakerConfig: { enabled: true },
 *   retryConfig: { enabled: true, retries: 3 }
 * }, async () => {
 *   // Your worker function logic here
 *   const user = await userService.findById(userId);
 *   return success(user);
 * });
 * 
 * // Use the observable function
 * const result = await getUser();
 * 
 * // Or execute directly in one step
 * const result = await executeObservableFunction({
 *   context: appContext,
 *   operationName: 'getUser'
 * }, async () => {
 *   const user = await userService.findById(userId);
 *   return success(user);
 * });
 * ```
 */
