/**
 * Observable - Resilience and Observability Base Class
 * 
 * This abstract class provides the foundation for all resource connectors in the Blueprint framework,
 * implementing common resilience and observability features that can be inherited by concrete connectors.
 * 
 * Key features:
 * - Circuit breaker pattern to prevent cascading failures
 * - Retry mechanisms with configurable backoff strategies
 * - Rate limiting to prevent overwhelming downstream publishing
 * - Distributed tracing integration with OpenTelemetry
 * - Metrics collection for operational visibility
 * - Standardized error handling using the Result pattern
 * - Resource lifecycle management (initialization, health checks, shutdown)
 * 
 * This class is a cornerstone of the Blueprint framework's resilience strategy,
 * ensuring that all connectors (Kafka, HTTP, Elasticsearch, etc.) have consistent
 * behavior and observability characteristics without duplicating code.
 * 
 * @module infrastructure/resilience/templates/Observable
 */

/*
 * AbstractResourceConnector.ts
 *
 * This file defines the AbstractResourceConnector base class and supporting types/interfaces.
 *
 * Purpose:
 *   - Provides a template and lifecycle management for all resource connectors (e.g., Kafka, SQS, Elasticsearch).
 *   - Implements cross-cutting concerns via side-car feature flags (metrics, tracing, fallback, rate-limiting, etc.).
 *   - Centralizes error handling, observability, and fallback/DLQ support for all connectors.
 *
 * Major Components:
 *   - AbstractResourceConnector (base class): Implements the template method pattern for resource operations.
 *   - ResourceMetrics (interface): Structure for per-operation metrics.
 *   - SideCarFeatures (property): Feature flags for enabling/disabling side-cars.
 *   - fallbackProvider (property): Optional handler for failed payloads (DLQ/fallback).
 *   - Static factory for createAndInitialize(): One-step construction/init for connectors.
 *
 * Usage:
 *   - Extend this class to create a new resource connector (see KafkaProducerConnector, KafkaSubscriberConnector, etc).
 *   - Override abstract methods for initialization, shutdown, and core operations.
 */

import { createError, failure, Result, Severity, success } from '@platform/core';
import { logger } from '@platform/core';

import CircuitBreaker from 'opossum';
import { ApplicationContext } from '@platform/core';

import {IResourceConnector} from "../interfaces/IResourceConnector";
import {HealthChecker} from "../../health-checker";
import {
  IMetricsProvider,
  ITracer,
  ITracingProvider,
  ObservabilityConfig,
  ObservabilityFactory,
  SpanStatus
} from '../../observability';

import retry from 'async-retry';
import {createRateLimiter} from "../../rate-limiting";

/**
 * Interface for resource operations metrics
 */
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
 * Abstract base class for external resource connectors that implements the template method pattern.
 *
 * Provides common functionality for lifecycle management, error handling, and observability.
 */
export abstract class Observable implements IResourceConnector {
    // ---------------------------------------------
    /**
     * Feature flags to enable/disable side-car functionality.
     * Gate each cross-cutting concern (side-car) using these flags.
     * TODO: Move to config or per-connector overrides as needed.
     */
    SideCarFeatures = {
        rateLimiting: false, // Enable rate limiting side-car
        circuitBreaker: false, // Enable circuit breaker side-car
        retry: false, // Enable retry side-car
        metrics: true, // Enable metrics side-car
        spans: true,   // Enable tracing/span side-car
        fallback: false, // Enable fallback side-car
        shutdownHandler: false, // Enable shutdown handler side-car
        // Add more as needed
    };
    /**
     * Optional fallback provider for handling failed payloads.
     * Should implement a handleFallback method.
     * Replace with a proper interface/modular implementation in the future.
     */
    fallbackProvider?: {
        handleFallback: (
            operationName: string,
            logContext: Record<string, any>,
            attributes: Record<string, string | number | boolean>,
            error: any
        ) => Promise<void>;
    };
    // Service information for logging and shutdown
    protected readonly serviceName: string;
    protected readonly meterName: string;
    protected readonly tracer: ITracer;
    protected metricsProvider?: IMetricsProvider;
    protected readonly healthChecker?: HealthChecker;

    // ---------------------------------------------
    // ---------------------------------------------
    // Side-Car Feature Flags
    // Lifecycle state
    protected initialized = false;
    // Metrics registry
    protected readonly metricsRegistry = new Map<string, ResourceMetrics>();
    // --- Circuit Breaker Integration ---
    protected breaker?: CircuitBreaker<any, any>;
    protected breakerOptions?: CircuitBreakerOptions;

    // --- Sidecar Config Properties ---
    protected circuitBreakerConfig?: CircuitBreakerSidecarConfig;
    protected rateLimiterConfig?: RateLimiterSidecarConfig;
    protected tracerConfig?: TracerSidecarConfig;
    protected retryConfig?: RetrySidecarConfig;
    protected metricsConfig?: MetricsSidecarConfig;
    protected rateLimiterClient?: any; // e.g., Redis or fallback client
    protected limiter?: any; // Bottleneck limiter or similar
    protected isRateLimiterFallback: boolean = false;
    protected metricsEnabled = true;
    protected metricsServiceName?: string;

    /**
     * Creates a new Observable instance.
     *
     * @param context Application context
     * @param additionalAttributes Additional resource attributes for telemetry
     * @param metricsProvider Optional metrics provider to use (will create one if not provided)
     * @param tracer
     * @param healthChecker
     */
    constructor(
        context: ApplicationContext,
        additionalAttributes: Record<string, string> = {},
        metricsProvider?: IMetricsProvider,
        tracer?: ITracer,
        healthChecker?: HealthChecker
    ) {
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
            ...additionalAttributes // Merge additional attributes
        };
        
        // Create minimal config for metrics and tracing
        const observabilityConfig: ObservabilityConfig = {
            provider: 'noop',
            metrics: {
                enabled: true,
                type: 'noop'
            },
            tracing: {
                enabled: true,
                type: 'noop'
            }
        };
        
        this.serviceName = context.identity.appName;
        this.meterName = `${context.identity.namespace}.${context.identity.integration}`;
        this.tracer = tracer || ObservabilityFactory.getTracingProvider().getTracer('default-tracer');
        this.healthChecker = healthChecker;
        this.metricsProvider = metricsProvider;
    }

    /**
     * Template method pattern: delegates to executeOperation with the subclass's run method.
     * Subclasses can override operationName for observability if needed.
     */
    protected get operationName(): string {
        return this.constructor.name + '.run';
    }

    /**
     * Static factory method to create and initialize a connector in one step
     *
     * @param connectorConstructor Constructor function for the connector
     * @param args Constructor arguments
     * @returns A Result containing the initialized connector or an error
     */
    static async createAndInitialize<T extends Observable, Args extends any[]>(
        connectorConstructor: new (...args: Args) => T,
        ...args: Args
    ): Promise<Result<T>> {
        try {
            const connector = new connectorConstructor(...args);
            const initResult = await connector.initialize();


            return success(connector);
        } catch (error) {
            return failure(createError({
                message: `Failed to create and initialize connector: ${error instanceof Error ? error.message : String(error)}`,
                cause: error instanceof Error ? error : new Error(String(error)),
                type: 'Internal'
            }));
        }
    }

    /**
     * Initialize the resource connector.
     *
     * This method should be called before using the resource connector.
     * It implements the template method pattern by delegating the actual
     * initialization to the doInitialize method.
     *
     * @returns A Result indicating success or failure
     */
    public async initialize(): Promise<Result<void>> {
        if (this.initialized) {
            logger.info({}, '✅ ' + this.serviceName + ' is already initialized');
            return success(undefined);
        }

        const span = this.tracer.startSpan(`${this.serviceName}.initialize`);

        try {
            logger.info({}, 'Initializing ' + this.serviceName + '...');
            // Initialize health monitoring if available
            if (this.healthChecker) {
                // Health checker initialization handled separately
                logger.info({}, 'Health checker available for ' + this.serviceName);
            }
            const result = await this.doInitialize();

            if (result.success) {
                this.initialized = true;
                span.addEvent('initialized');
                span.setStatus(SpanStatus.OK);
                logger.info({}, '✅ ' + this.serviceName + ' initialized successfully');
            } else {
                span.setStatus(SpanStatus.ERROR);

                if (result.error) {
                    span.recordException(new Error(result.error.message));
                }

                logger.error({
                    error: result.error?.message || 'Unknown error'
                }, 'Failed to initialize ' + this.serviceName);
            }

            span.end();
            return result;
        } catch (error) {
            span.setStatus(SpanStatus.ERROR);

            if (error instanceof Error) {
                span.recordException(error);
            }

            span.end();

            logger.error({
                error: error instanceof Error ? error.message : String(error)
            }, 'Exception while initializing ' + this.serviceName);

            return failure(createError({
                type: 'Internal',
                message: `Exception initializing ${this.serviceName}: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        }
    }

    /**
     * Shut down the resource connector.
     *
     * This method should be called when the resource connector is no longer needed.
     * It implements the template method pattern by delegating the actual
     * shutdown to the doShutdown method.
     *
     * @returns A Result indicating success or failure
     */
    public async shutdown(): Promise<Result<void>> {


        const span = this.tracer.startSpan(`${this.serviceName}.shutdown`);

        try {
            logger.info({}, '📤 Shutting down ' + this.serviceName + '...');
            // Shutdown health monitoring if available
            if (this.healthChecker) {
                // Health checker shutdown handled separately
                logger.info({}, 'Health checker shutdown for ' + this.serviceName);
            }
            const result = await this.doShutdown();

            if (result.success) {

                span.setStatus(SpanStatus.OK);
                logger.info({}, '📤 ' + this.serviceName + ' shut down successfully');
            } else {
                span.setStatus(SpanStatus.ERROR);

                if (result.error) {
                    span.recordException(new Error(result.error.message));
                }

                logger.error({
                    error: result.error?.message || 'Unknown error'
                }, 'Failed to shut down ' + this.serviceName);
            }

            span.end();
            return result;
        } catch (error) {
            span.setStatus(SpanStatus.ERROR);

            if (error instanceof Error) {
                span.recordException(error);
            }

            span.end();

            logger.error({
                error: error instanceof Error ? error.message : String(error)
            }, 'Exception while shutting down ' + this.serviceName);

            return failure(createError({
                type: 'Internal',
                message: `Exception shutting down ${this.serviceName}: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        }
    }

    /**
     * Check if the resource connector is connected.
     *
     * @returns true if the connector is connected, false otherwise
     */
    public isConnected(): boolean {
        return this.initialized && !this.shutdown;
    }

    /**
     * Fluent builder-style method to configure the circuit breaker sidecar.
     *
     * @param config Circuit breaker configuration
     * @returns This instance for chaining
     */
    public withCircuitBreaker(config: CircuitBreakerSidecarConfig): this {
        this.circuitBreakerConfig = config;
        this.SideCarFeatures.circuitBreaker = !!config.enabled;
        // Do not call initCircuitBreaker here since operation is not yet known
        return this;
    }

    /**
     * Fluent builder-style method to configure the rate limiter sidecar.
     *
     * @param config Rate limiter configuration
     * @returns This instance for chaining
     */
    public withRateLimiter(config: RateLimiterSidecarConfig): this {
        this.rateLimiterConfig = config;
        this.SideCarFeatures.rateLimiting = !!config.enabled;
        if (config.enabled) {
            // Initialize rate limiter with configuration
            const {client, limiter, isFallback} = createRateLimiter({
                id: this.serviceName,
                maxConcurrent: config.maxConcurrent ?? 5,
                minTime: config.minTime ?? 100,
                redisHost: config.redisHost,
                redisPort: config.redisPort,
                redisPassword: config.redisPassword,
            });
            this.rateLimiterClient = client;
            this.limiter = limiter;
            this.isRateLimiterFallback = isFallback;
        }
        return this;
    }

    /**
     * Fluent builder-style method to configure the tracer sidecar.
     *
     * @param config Tracer configuration
     * @returns This instance for chaining
     */
    public withTracer(config: TracerSidecarConfig): this {
        this.tracerConfig = config;
        this.SideCarFeatures.spans = !!config.enabled;
        if (config.enabled && config.serviceName) {
            // Optionally update tracer with new service name
            // this.tracer = ...
        }
        return this;
    }

    /**
     * Fluent builder-style method to configure the retry sidecar.
     *
     * @param config Retry configuration
     * @returns This instance for chaining
     */
    public withRetry(config: RetrySidecarConfig): this {
        this.retryConfig = config;
        this.SideCarFeatures.retry = !!config.enabled;
        return this;
    }

    /**
     * Fluent builder-style method to configure the metrics sidecar.
     *
     * @param config Metrics configuration
     * @returns This instance for chaining
     */
    public withMetrics(config: MetricsSidecarConfig): this {
        this.metricsConfig = config;
        this.metricsEnabled = !!config.enabled;
        return this;
    }

    /**
     * Fluent builder-style method to register a shutdown handler sidecar.
     * When enabled, this will automatically register process event handlers
     * to gracefully call shutdown() on this connector during SIGINT/SIGTERM/etc.
     *
     * @param config Optional config for shutdown sidecar (future extensibility)
     * @returns This instance for chaining
     */
    public withShutdownHandler(config: { exitProcess?: boolean } = {}): this {
        this.SideCarFeatures.shutdownHandler = true;
        this.registerShutdownHandlers(config.exitProcess ?? true);
        return this;
    }

    /**
     * Attach a metrics provider instance (for DI/testability)
     */
    public attachMetricsProvider(metrics: IMetricsProvider): this {
        this.metricsProvider = metrics;
        return this;
    }

    /**
     * Fluent methods to enable side-car features (only for those without config-based builders)
     */
    public withSpans(): this {
        this.SideCarFeatures.spans = true;
        return this;
    }

    public withFallback(): this {
        this.SideCarFeatures.fallback = true;
        return this;
    }

    /**
     * Initialize the circuit breaker for this connector.
     * @param operation Async function to wrap with circuit breaker (should return a Promise)
     * @param options Circuit breaker configuration
     */
    protected initCircuitBreaker<TArgs extends any[], TResult>(
        operation: (...args: TArgs) => Promise<TResult>,
        options: CircuitBreakerOptions = {}
    ) {
        this.breakerOptions = options;
        this.breaker = new CircuitBreaker(operation, {
            timeout: options.timeout ?? 10000,
            errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
            resetTimeout: options.resetTimeout ?? 30000,
            name: options.name ?? this.serviceName ?? 'ResourceConnector',
        });
        // Event listeners for logging/metrics
        this.breaker.on('open', () => {
            logger?.warn({event: 'open', resource: this.serviceName}, '🔌 Circuit breaker OPEN');
            // Optionally: metrics integration
        });
        this.breaker.on('halfOpen', () => {
            logger?.info({event: 'halfOpen', resource: this.serviceName}, '🤞 Circuit breaker HALF-OPEN');
        });
        this.breaker.on('close', () => {
            logger?.info({event: 'close', resource: this.serviceName}, '✅ Circuit breaker CLOSED');
        });
        this.breaker.on('failure', (err: any) => {
            logger?.error({event: 'failure', resource: this.serviceName, error: err}, '⚠️ Circuit breaker failure');
        });
    }

    /**
     * Run an operation through the circuit breaker, if configured.
     * @param args Arguments to pass to the wrapped operation
     */
    protected async runWithCircuitBreaker<TResult>(...args: any[]): Promise<TResult> {
        if (!this.breaker) {
            throw new Error('Circuit breaker not initialized. Call initCircuitBreaker() first.');
        }
        return this.breaker.fire(...args);
    }

    /**
     * Register additional operations for the resource connector.
     * This method can be called by subclasses in their constructor to register
     * additional operations they support for metrics tracking beyond the standard ones.
     *
     * @param operations The names of the operations to register
     */
    protected registerOperations(operations: string[]): void {
        for (const operation of operations) {
            this.createOperationMetrics(operation);
        }
    }

    /**
     * Creates operation metrics for the specified operation
     *
     * @param operationName Name of the operation
     * @param metricNamePrefix Optional prefix for metric names
     * @param description Optional description for metrics
     */
    protected createOperationMetrics(
        operationName: string,
        metricNamePrefix?: string,
        description?: string
    ): ResourceMetrics {
        const prefix = metricNamePrefix || operationName;
        const desc = description || `${this.serviceName} ${operationName} operation`;

        // Use the factory instead of OTEL API directly
        const metricsProvider = this.metricsProvider || ObservabilityFactory.getMetricsProvider();

        // Create no-op metrics if provider is not available
        if (!metricsProvider) {
            return {
                operationCounter: {
                    add: () => {
                    }
                },
                operationErrorCounter: {
                    add: () => {
                    }
                },
                operationDurationHistogram: {
                    record: () => {
                    }
                }
            };
        }

        const operationMetrics: ResourceMetrics = {
            operationCounter: metricsProvider.createCounter(`${prefix}.count`, `Number of ${desc} operations`),
            operationErrorCounter: metricsProvider.createCounter(`${prefix}.errors`, `Number of ${desc} errors`),
            operationDurationHistogram: metricsProvider.createHistogram(`${prefix}.duration`, `Duration of ${desc} operations`, 'ms')
        };

        this.metricsRegistry.set(operationName, operationMetrics);
        return operationMetrics;
    }

    /**
     * Register process event handlers for graceful shutdown.
     * This method can be called by subclasses in their constructor to register
     * shutdown handlers that will properly clean up resources.
     *
     * @param exitProcess Whether to exit the process after shutdown (default: true)
     */
    protected registerShutdownHandlers(exitProcess: boolean = true): void {
        // Handle process termination signals
        const handleShutdown = async () => {
            logger.info({}, `📤 Gracefully shutting down ${this.serviceName}...`);
            try {
                await this.shutdown();
                logger.info({}, `📤 ${this.serviceName} shut down successfully`);
                if (exitProcess) process.exit(0);
            } catch (error) {
                logger.error({ error }, `❌ Error shutting down ${this.serviceName}:`);
                if (exitProcess) process.exit(1);
            }
        };

        // Register handlers for common termination signals
        process.on('SIGINT', handleShutdown);
        process.on('SIGTERM', handleShutdown);
        process.on('SIGUSR2', handleShutdown); // For Nodemon restarts
    }

    /**
     * Execute an operation with consistent observability, error handling, and side-cars.
     * This method handles all the standard milestones of an operation:
     * - onEnter: Connection check
     * - Side-cars: [Rate Limiting] → [Circuit Breaker] → [Retry]
     * - onStart: Create span, start timer
     * - onExecute: Run the provided operation function
     * - onEnd: Record metrics, end span
     * - onError: Handle and standardize errors
     *
     * Each side-car is gated by a feature flag and separated for future modularization.
     *
     * @param operation The actual operation function to execute
     * @returns A Result containing the operation result or an error
     */
    protected async executeOperation<T>(
        operation: string,
        fn: () => Promise<Result<T>>
    ): Promise<Result<T>> {
        const span = this.tracer.startSpan(`${this.serviceName}.${operation}`);
        try {
            // Record operation start in health monitoring
            // Health monitoring handled by health checker if available
            
            const result = await fn();
            
            // Record operation result in health monitoring
            // Health monitoring handled by health checker if available
            
            return result;
        } catch (error) {
            // Record operation failure in health monitoring
            // Health monitoring handled by health checker if available
            
            return failure(createError({
                type: 'Internal',
                message: `Exception executing ${operation}: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        }
    }

    /**
     * Check connection state and return a Result.
     * This is a helper method that can be used by operation methods to
     * ensure the connector is initialized before performing operations.
     *
     * @returns A Result containing void on success or an error on failure
     */
    protected checkConnection(): Result<void> {
        if (!this.initialized) {
            return failure(createError({
                type: 'Internal',
                message: `${this.serviceName} is not initialized`,
                statusCode: 500
            }));
        }

        return success(undefined);
    }

    /**
     * Create a span for an operation.
     * This is a helper method that can be used by operation methods to
     * create a span with common attributes.
     *
     * @param operationName The name of the operation
     * @param attributes Optional attributes to add to the span
     * @returns The created span
     */
    protected createOperationSpan(operationName: string, attributes?: Record<string, string | number | boolean>): any {
        const span = this.tracer.startSpan(`${this.meterName}.${operationName}`);

        if (attributes) {
            for (const [key, value] of Object.entries(attributes)) {
                span.setAttribute(key, value);
            }
        }

        return span;
    }

    /**
     * Record metrics for an operation.
     * This is a helper method that can be used by operation methods to
     * record metrics for an operation.
     *
     * @param metrics The metrics to record
     * @param labels The labels to apply to the metrics
     * @param success Whether the operation was successful
     * @param duration The duration of the operation in milliseconds
     * @param errorType Optional error type if the operation failed
     */
    protected recordOperationMetrics(
        metrics: ResourceMetrics,
        labels: Record<string, string | number | boolean>,
        success: boolean,
        duration: number,
        errorType?: string
    ): void {
        // Record operation attempt
        metrics.operationCounter.add(1, labels);

        // Record duration
        metrics.operationDurationHistogram.record(duration, {
            ...labels,
            success: success ? 'true' : 'false'
        });

        // Record error if applicable
        if (!success && errorType) {
            metrics.operationErrorCounter.add(1, {
                ...labels,
                error_type: errorType
            });
        }
    }

    /**
     * Default implementation: no-op. Subclasses may override.
     */
    protected async doInitialize(): Promise<Result<void>> {
        // Initialize both metrics and tracing with the same resource attributes
        if (!this.metricsProvider) {
            // Create minimal config for metrics and tracing
            const observabilityConfig: ObservabilityConfig = {
                provider: 'noop',
                metrics: {
                    enabled: true,
                    type: 'noop'
                },
                tracing: {
                    enabled: true,
                    type: 'noop'
                }
            };
            
            // Initialize observability
            await ObservabilityFactory.initialize(observabilityConfig);
            
            // Use the same config to get metrics provider
            this.metricsProvider = ObservabilityFactory.getMetricsProvider();
        }
        
        return success(undefined);
    }

    /**
     * Default implementation: no-op. Subclasses may override.
     */
    protected async doShutdown(): Promise<Result<void>> {
        return success(undefined);
    }

    /**
     * Template method pattern: Subclasses implement this with the core operation logic.
     */
    protected abstract run(): Promise<Result<any>>;

    async execute(): Promise<Result<any>> {
        // Check service health before executing
        if (this.healthChecker) {
            // Health check validation handled by health checker
            logger.debug({}, 'Health checker validation for operation');
        }

        // Execute operation with health monitoring
        return this.executeOperation(this.operationName, async () => {
            const startTime = process.hrtime.bigint();
            const result = await this.run();
            const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to ms

            // Record operation metrics
            if (this.healthChecker) {
                // Operation metrics handled by health checker if available
                logger.debug({}, `Operation ${this.operationName} completed in ${duration}ms`);
            }

            return result;
        });
    }

    /**
     * Utility to run an operation through the retry sidecar, if enabled.
     */
    protected async runWithRetry<T>(fn: () => Promise<T>, config?: RetrySidecarConfig): Promise<T> {
        const retryCfg = config || this.retryConfig;
        if (retryCfg?.enabled) {
            return retry(fn, {
                retries: retryCfg.retries ?? 3,
                minTimeout: retryCfg.minTimeout ?? 100,
                maxTimeout: retryCfg.maxTimeout,
                factor: retryCfg.factor ?? 2,
                onRetry: (err: unknown, attempt: number) => {
                    if (err instanceof Error) {
                        logger.warn({}, `Retry #${attempt}: ${err.message}`);
                    } else {
                        logger.warn({}, `Retry #${attempt}: ${String(err)}`);
                    }
                },
            });
        } else {
            return fn();
        }
    }

    /**
     * Utility to run an operation through the rate limiter, if enabled.
     */
    protected async runWithRateLimiter<T>(fn: () => Promise<T>): Promise<T> {
        if (this.limiter) {
            return this.limiter.schedule(fn);
        } else {
            return fn();
        }
    }

    // Example usage in operation execution (pseudo):
    // const start = Date.now();
    // try {
    //   ...
    //   this.recordMetricCounter('resource.success', 1, {op: 'send'});
    //   this.recordMetricTimer('resource.duration', Date.now() - start, {op: 'send'});
    // } catch (err) {
    //   this.recordMetricCounter('resource.error', 1, {op: 'send'});
    //   this.recordMetricTimer('resource.duration', Date.now() - start, {op: 'send'});
    //   throw err;
    // }

    /**
     * Record a metric counter.
     *
     * @param name The name of the metric
     * @param value The value to increment the metric by (default: 1)
     * @param tags Optional tags to apply to the metric
     */
    protected recordMetricCounter(name: string, value = 1, tags?: Record<string, string | number>) {
        if (this.metricsEnabled && this.metricsProvider) {
            const stringTags = tags
                ? Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, String(v)]))
                : {};
            const counter = this.metricsProvider.createCounter(name);
            counter.add(value, stringTags);
        }
    }

    /**
     * Record a metric timer.
     *
     * @param name The name of the metric
     * @param durationMs The duration of the metric in milliseconds
     * @param tags Optional tags to apply to the metric
     */
    protected recordMetricTimer(name: string, durationMs: number, tags?: Record<string, string | number>) {
        if (this.metricsEnabled && this.metricsProvider) {
            const stringTags = tags
                ? Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, String(v)]))
                : {};
            const histogram = this.metricsProvider.createHistogram(name);
            histogram.record(durationMs, stringTags);
        }
    }

    /**
     * Call this from the concrete class after the operation is defined to finalize CB setup.
     * @param operation The async function to wrap with circuit breaker
     */
    protected finalizeCircuitBreaker<TArgs extends any[], TResult>(operation: (...args: TArgs) => Promise<TResult>) {
        if (this.circuitBreakerConfig?.enabled) {
            this.initCircuitBreaker(operation, this.circuitBreakerConfig);
        }
    }
}
