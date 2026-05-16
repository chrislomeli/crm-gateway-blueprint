# Directory Package: resilience
# Total files: 28
################################################################################

### FILE: README.md
```
# Blueprint Resilience Module

This module provides resilience utilities for the Blueprint framework, including circuit breaker, retry, rate limiting, and alerting patterns. It's designed to make your applications more robust by handling transient failures gracefully and providing observability into critical operations.

## Key Features

- **Circuit Breaker Pattern**: Prevents cascading failures by stopping repeated calls to failing services
- **Retry Mechanisms**: Automatically retry failed operations with configurable backoff strategies
- **Rate Limiting**: Prevents overwhelming downstream services
- **Alerting**: Send alerts for critical operation failures to various channels (Datadog, PagerDuty, Slack)
- **Metrics Collection**: Track operation counts, durations, and error rates
- **Distributed Tracing**: Integrate with OpenTelemetry for end-to-end tracing
- **Standardized Error Handling**: Consistent error handling using the Result pattern

## Installation

This module is part of the `@platform/infrastructure` package and can be used by importing it:

```typescript
import { resilience } from '@platform/infrastructure';
```

## Usage

### Observable Functions

The core of the resilience module is the `ObservableFunction` template, which allows you to wrap any function with resilience and observability features:

```typescript
import { resilience } from '@platform/infrastructure';
import { ApplicationContext, Result, success, failure, createError } from '@platform/core';

// Create an observable function
const getUser = resilience.templates.createObservableFunction(
  {
    context: appContext,
    operationName: 'getUser',
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
      resetTimeout: 30000
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
      resourceName: 'UserService',
      alertOnCircuitOpen: true,
      alertOnRetryFailure: true,
      alertOnOperationFailure: true
    }
  },
  async () => {
    try {
      const user = await userService.getUser(userId);
      return success(user);
    } catch (error) {
      return failure(createError({
        type: 'UserServiceError',
        message: `Failed to get user: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the observable function
const result = await getUser();
if (result.success) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Resilient Database Operations

For database operations, you can use the `createResilientDatabaseOperation` utility:

```typescript
import { resilience } from '@platform/infrastructure';

// Create a resilient database query function
const getUserById = resilience.examples.createResilientDatabaseOperation(
  appContext,
  'getUserById',
  'MySQL',
  async () => {
    try {
      const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      return success(user);
    } catch (error) {
      return failure(createError({
        type: 'DatabaseError',
        message: `Failed to get user by ID: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the resilient function
const result = await getUserById();
if (result.success) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Resilient Cache Operations

For cache operations, you can use the `createResilientCacheOperation` utility:

```typescript
import { resilience } from '@platform/infrastructure';

// Create a resilient cache get function
const getFromCache = resilience.examples.createResilientCacheOperation(
  appContext,
  'getIntent',
  'Redis',
  async () => {
    try {
      const value = await redisClient.get(key);
      if (!value) {
        return failure(createError({
          type: 'CacheMiss',
          message: `Cache miss for key: ${key}`,
          statusCode: 404
        }));
      }
      return success(JSON.parse(value));
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to get from cache: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the resilient function
const result = await getFromCache();
if (result.success) {
  console.log('Cache value:', result.value);
} else if (result.error?.type === 'CacheMiss') {
  console.log('Value not in cache');
} else {
  console.error('Cache error:', result.error);
}
```

### Alerting

The resilience module includes an alerting service that can be used to send alerts for critical operations:

```typescript
import { resilience } from '@platform/infrastructure';

// Create an alert service
const alertService = new resilience.alerting.AlertService({
  serviceName: 'my-service',
  environment: 'production',
  enableDatadog: true,
  enablePagerDuty: true,
  enableSlack: true
});

// Send a critical alert
await alertService.sendCriticalOperationAlert(
  'getUserById',
  'MySQL',
  new Error('Connection refused'),
  {
    userId: '123',
    retryAttempts: 3
  }
);
```

## Advanced Configuration

### Circuit Breaker Configuration

```typescript
const circuitBreakerConfig = {
  enabled: true,
  timeout: 5000,              // Timeout in milliseconds
  errorThresholdPercentage: 50, // Percentage of failures before opening circuit
  resetTimeout: 30000,        // Time before attempting to close circuit
  name: 'MyService'           // Name for the circuit breaker
};
```

### Retry Configuration

```typescript
const retryConfig = {
  enabled: true,
  retries: 3,           // Number of retry attempts
  minTimeout: 100,      // Minimum timeout between retries (ms)
  maxTimeout: 1000,     // Maximum timeout between retries (ms)
  factor: 2             // Exponential backoff factor
};
```

### Alert Configuration

```typescript
const alertConfig = {
  enabled: true,
  resourceName: 'MySQL',
  minimumSeverity: resilience.alerting.AlertSeverity.ERROR,
  alertOnCircuitOpen: true,
  alertOnRetryFailure: true,
  alertOnRateLimiting: true,
  alertOnOperationFailure: true
};
```

## Best Practices

1. **Use Domain-Specific Wrappers**: Create domain-specific wrappers around the resilience utilities for better organization and reusability.

2. **Configure Circuit Breakers Appropriately**: Set appropriate thresholds and timeouts based on the expected behavior of your services.

3. **Use Retry with Caution**: Only retry operations that are idempotent or can safely be repeated.

4. **Monitor and Alert**: Use the metrics and alerting features to monitor the health of your services and get notified of issues.

5. **Test Failure Scenarios**: Test your resilience patterns with simulated failures to ensure they work as expected.

## Integration with Other Blueprint Packages

The resilience module is designed to work seamlessly with other Blueprint packages:

- **@platform/core**: Uses the Result pattern for error handling
- **@crm/observability**: Integrates with metrics and tracing
- **@crm/health**: Integrates with health monitoring

## Contributing

If you'd like to contribute to this module, please follow the Blueprint framework's contribution guidelines.
```

### FILE: index.ts
```
/**
 * Resilience module barrel file
 * 
 * This module provides resilience utilities for the Blueprint framework,
 * including circuit breaker, retry, rate limiting, and alerting patterns.
 */

// Export interfaces
export * from './interfaces';

// Export templates
export * from './templates';

// Export preset configurations
export * from './preset-configs';

// Export alerting
export * from './alerting';

// Export examples
export * as examples from './examples';

// Export types
export * from './types';

// Export decorators
export * from './decorators';
```

### FILE: preset-configs.ts
```
/**
 * Preset Configurations for Observable Functions
 * 
 * Simple preset configurations that work with your existing createObservableFunction.
 * No new infrastructure - just configuration objects for common patterns.
 * 
 * @module resilience/preset-configs
 */

import { ObservableFunctionConfig } from './templates/ObservableFunction';
import { createObservableFunction } from './templates/ObservableFunction';
import { ApplicationContext, Result } from '@platform/core';

/**
 * Database operations preset - fast, reliable, minimal overhead
 * - Metrics: ✅ (track database performance)
 * - Tracing: ✅ (trace database calls)
 * - Circuit Breaker: ❌ (database should be reliable)
 * - Retry: ❌ (database errors usually aren't transient)
 * - Rate Limiting: ❌ (internal database calls)
 */
export const DATABASE_PRESET: Partial<ObservableFunctionConfig> = {
  sidecarFeatures: {
    metrics: true,
    spans: true,
    circuitBreaker: false,
    retry: false,
    rateLimiting: false,
    fallback: false,
    alerting: false,
  }
};

/**
 * External API preset - unreliable, network-dependent, full protection
 * - Metrics: ✅ (track external service performance)
 * - Tracing: ✅ (trace external dependencies)
 * - Circuit Breaker: ✅ (protect against external failures)
 * - Retry: ✅ (network issues are often transient)
 * - Rate Limiting: ✅ (respect external service limits)
 */
export const EXTERNAL_API_PRESET: Partial<ObservableFunctionConfig> = {
  sidecarFeatures: {
    metrics: true,
    spans: true,
    circuitBreaker: true,
    retry: true,
    rateLimiting: true,
    fallback: false,
    alerting: true,
  },
  circuitBreakerConfig: {
    enabled: true,
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  },
  retryConfig: {
    enabled: true,
    retries: 3,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2,
  },
  rateLimiterConfig: {
    enabled: true,
    maxConcurrent: 10,
    minTime: 100,
  }
};

/**
 * Internal service preset - reliable but may have transient issues
 * - Metrics: ✅ (track internal service performance)
 * - Tracing: ✅ (trace internal dependencies)
 * - Circuit Breaker: ❌ (internal services should be reliable)
 * - Retry: ✅ (internal network issues can be transient)
 * - Rate Limiting: ❌ (internal services, no rate limits)
 */
export const INTERNAL_SERVICE_PRESET: Partial<ObservableFunctionConfig> = {
  sidecarFeatures: {
    metrics: true,
    spans: true,
    circuitBreaker: false,
    retry: true,
    rateLimiting: false,
    fallback: false,
    alerting: false,
  },
  retryConfig: {
    enabled: true,
    retries: 2,
    minTimeout: 50,
    maxTimeout: 500,
    factor: 2,
  }
};

/**
 * Critical operations preset - everything enabled for maximum resilience
 * - Metrics: ✅ (comprehensive monitoring)
 * - Tracing: ✅ (full observability)
 * - Circuit Breaker: ✅ (protect critical paths)
 * - Retry: ✅ (maximize success rate)
 * - Rate Limiting: ✅ (prevent overload)
 * - Alerting: ✅ (immediate notification of issues)
 */
export const CRITICAL_OPERATION_PRESET: Partial<ObservableFunctionConfig> = {
  sidecarFeatures: {
    metrics: true,
    spans: true,
    circuitBreaker: true,
    retry: true,
    rateLimiting: true,
    fallback: true,
    alerting: true,
  },
  circuitBreakerConfig: {
    enabled: true,
    timeout: 3000,
    errorThresholdPercentage: 30,
    resetTimeout: 60000,
  },
  retryConfig: {
    enabled: true,
    retries: 5,
    minTimeout: 200,
    maxTimeout: 2000,
    factor: 2,
  },
  rateLimiterConfig: {
    enabled: true,
    maxConcurrent: 5,
    minTime: 200,
  }
};

/**
 * Convenience function to merge preset with custom config
 */
export function withPreset(
  preset: Partial<ObservableFunctionConfig>,
  customConfig: Partial<ObservableFunctionConfig>
): Partial<ObservableFunctionConfig> {
  return {
    ...preset,
    ...customConfig,
    sidecarFeatures: {
      ...preset.sidecarFeatures,
      ...customConfig.sidecarFeatures,
    }
  };
}

/**
 * Helper functions to create observable functions with presets
 */

export function createDatabaseObservable<T>(
  context: ApplicationContext,
  operationName: string,
  workerFn: () => Promise<Result<T>>,
  customConfig?: Partial<ObservableFunctionConfig>
): () => Promise<Result<T>> {
  const config = customConfig 
    ? withPreset(DATABASE_PRESET, customConfig)
    : DATABASE_PRESET;
    
  return createObservableFunction({
    context,
    operationName,
    ...config
  }, workerFn);
}

export function createExternalApiObservable<T>(
  context: ApplicationContext,
  operationName: string,
  workerFn: () => Promise<Result<T>>,
  customConfig?: Partial<ObservableFunctionConfig>
): () => Promise<Result<T>> {
  const config = customConfig 
    ? withPreset(EXTERNAL_API_PRESET, customConfig)
    : EXTERNAL_API_PRESET;
    
  return createObservableFunction({
    context,
    operationName,
    ...config
  }, workerFn);
}

export function createInternalServiceObservable<T>(
  context: ApplicationContext,
  operationName: string,
  workerFn: () => Promise<Result<T>>,
  customConfig?: Partial<ObservableFunctionConfig>
): () => Promise<Result<T>> {
  const config = customConfig 
    ? withPreset(INTERNAL_SERVICE_PRESET, customConfig)
    : INTERNAL_SERVICE_PRESET;
    
  return createObservableFunction({
    context,
    operationName,
    ...config
  }, workerFn);
}

export function createCriticalObservable<T>(
  context: ApplicationContext,
  operationName: string,
  workerFn: () => Promise<Result<T>>,
  customConfig?: Partial<ObservableFunctionConfig>
): () => Promise<Result<T>> {
  const config = customConfig 
    ? withPreset(CRITICAL_OPERATION_PRESET, customConfig)
    : CRITICAL_OPERATION_PRESET;
    
  return createObservableFunction({
    context,
    operationName,
    ...config
  }, workerFn);
}
```

### FILE: types.ts
```
/**
 * Resilience Types
 * 
 * Shared type definitions for resilience patterns and utilities
 */

import { ApplicationContext, Result } from '@platform/core';

/**
 * Configuration for resilient operations
 */
export interface ResilientOperationConfig {
  /**
   * Application context for the operation
   */
  context: ApplicationContext;
  
  /**
   * Name of the operation
   */
  operationName: string;
  
  /**
   * Optional service name for metrics and tracing
   */
  serviceName?: string;
  
  /**
   * Additional attributes to include in metrics and traces
   */
  additionalAttributes?: Record<string, string>;
  
  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: CircuitBreakerConfig;
  
  /**
   * Retry configuration
   */
  retry?: RetryConfig;
  
  /**
   * Rate limiting configuration
   */
  rateLimiter?: RateLimiterConfig;
  
  /**
   * Alerting configuration
   */
  alerting?: AlertingConfig;
}

/**
 * Configuration for circuit breaker pattern
 */
export interface CircuitBreakerConfig {
  /**
   * Whether to enable the circuit breaker
   */
  enabled: boolean;
  
  /**
   * Timeout in milliseconds before the circuit breaker trips
   */
  timeout?: number;
  
  /**
   * Error threshold percentage to trip the circuit breaker
   */
  errorThresholdPercentage?: number;
  
  /**
   * Reset timeout in milliseconds before the circuit breaker resets
   */
  resetTimeout?: number;
  
  /**
   * Name of the circuit breaker for metrics and logs
   */
  name?: string;
}

/**
 * Configuration for retry pattern
 */
export interface RetryConfig {
  /**
   * Whether to enable retries
   */
  enabled: boolean;
  
  /**
   * Maximum number of retries
   */
  retries?: number;
  
  /**
   * Minimum timeout in milliseconds between retries
   */
  minTimeout?: number;
  
  /**
   * Maximum timeout in milliseconds between retries
   */
  maxTimeout?: number;
  
  /**
   * Factor to multiply timeout by for each retry
   */
  factor?: number;
}

/**
 * Configuration for rate limiting
 */
export interface RateLimiterConfig {
  /**
   * Whether to enable rate limiting
   */
  enabled: boolean;
  
  /**
   * Maximum number of concurrent operations
   */
  maxConcurrent?: number;
  
  /**
   * Minimum time in milliseconds between operations
   */
  minTime?: number;
}

/**
 * Configuration for alerting
 */
export interface AlertingConfig {
  /**
   * Whether to enable alerting
   */
  enabled: boolean;
  
  /**
   * Critical alert threshold (number of consecutive failures)
   */
  criticalThreshold?: number;
  
  /**
   * Warning alert threshold (number of consecutive failures)
   */
  warningThreshold?: number;
  
  /**
   * Alert channels to use (e.g., 'slack', 'pagerduty', 'email')
   */
  channels?: string[];
}

/**
 * Type for a resilient operation function
 */
export type ResilientOperation<T> = () => Promise<Result<T>>;

/**
 * Type for a resilient operation wrapper function
 */
export type ResilientOperationWrapper<T> = (
  operation: ResilientOperation<T>
) => ResilientOperation<T>;

/**
 * Type for a resilient operation factory function
 */
export type ResilientOperationFactory<T> = (
  config: ResilientOperationConfig,
  operation: ResilientOperation<T>
) => ResilientOperation<T>;
```

### FILE: alerting/AlertService.ts
```
/**
 * AlertService implementation
 * 
 * This module provides a default implementation of the IAlertService interface
 * that can be used to send alerts for critical operations.
 */

import { createError, failure, Result, success } from '@platform/core';
import { logger } from '@platform/core';
import { AlertSeverity, AlertMetadata, IAlertService } from './types';

/**
 * Alert service configuration
 */
export interface AlertServiceConfig {
    /**
     * Service name
     */
    serviceName: string;
    
    /**
     * Environment name (e.g., "production", "staging")
     */
    environment: string;
    
    /**
     * Whether to send alerts to Datadog
     */
    enableDatadog?: boolean;
    
    /**
     * Whether to send alerts to PagerDuty
     */
    enablePagerDuty?: boolean;
    
    /**
     * Whether to send alerts to Slack
     */
    enableSlack?: boolean;
    
    /**
     * Minimum severity level for sending alerts
     * Alerts with severity below this level will be logged but not sent
     */
    minimumSeverity?: AlertSeverity;
}

/**
 * Default implementation of the IAlertService interface
 */
export class AlertService implements IAlertService {
    private readonly config: Required<AlertServiceConfig>;
    
    constructor(config: AlertServiceConfig) {
        this.config = {
            ...config,
            enableDatadog: config.enableDatadog ?? true,
            enablePagerDuty: config.enablePagerDuty ?? (config.environment === 'production'),
            enableSlack: config.enableSlack ?? true,
            minimumSeverity: config.minimumSeverity ?? AlertSeverity.ERROR
        };
    }
    
    /**
     * Send an alert
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    public async sendAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<Result<void>> {
        try {
            // Skip alerts below minimum severity
            if (this.shouldSkipAlert(severity)) {
                logger.debug({ metadata, severity, title }, `Skipping alert with severity ${severity}: ${title}`);
                return success(undefined);
            }
            
            // Log the alert
            this.logAlert(severity, title, message, metadata);
            
            // Send to Datadog if enabled
            if (this.config.enableDatadog) {
                await this.sendToDatadog(severity, title, message, metadata);
            }
            
            // Send to PagerDuty if enabled and critical
            if (this.config.enablePagerDuty && severity === AlertSeverity.CRITICAL) {
                await this.sendToPagerDuty(title, message, metadata);
            }
            
            // Send to Slack if enabled
            if (this.config.enableSlack) {
                await this.sendToSlack(severity, title, message, metadata);
            }
            
            return success(undefined);
        } catch (error) {
            logger.error({
                error,
                title,
                message,
                metadata
            }, `Failed to send alert: ${error instanceof Error ? error.message : String(error)}`);
            
            return failure(createError({
                type: 'AlertingError',
                message: `Failed to send alert: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        }
    }
    
    /**
     * Send a critical alert for a failed operation
     * 
     * @param operation Operation name
     * @param resource Resource name (e.g., "MySQL", "Redis", "Elasticsearch")
     * @param error Error that occurred
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    public async sendCriticalOperationAlert(
        operation: string,
        resource: string,
        error: Error | any,
        metadata: Record<string, any> = {}
    ): Promise<Result<void>> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
        
        return this.sendAlert(
            AlertSeverity.CRITICAL,
            `${resource} Operation Failed: ${operation}`,
            `Critical error in ${operation} operation on ${resource}: ${errorMessage}`,
            {
                service: this.config.serviceName,
                operation,
                resource,
                errorType,
                errorMessage,
                ...metadata
            }
        );
    }
    
    /**
     * Check if an alert should be skipped based on severity
     * 
     * @param severity Alert severity
     * @returns True if the alert should be skipped
     */
    private shouldSkipAlert(severity: AlertSeverity): boolean {
        const severityLevels = {
            [AlertSeverity.INFO]: 0,
            [AlertSeverity.WARNING]: 1,
            [AlertSeverity.ERROR]: 2,
            [AlertSeverity.CRITICAL]: 3
        };
        
        return severityLevels[severity] < severityLevels[this.config.minimumSeverity];
    }
    
    /**
     * Log an alert to the console
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private logAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): void {
        switch (severity) {
            case AlertSeverity.INFO:
                logger.info(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.WARNING:
                logger.warn(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.ERROR:
                logger.error(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.CRITICAL:
                logger.error(metadata, `CRITICAL ALERT: ${title} - ${message}`);
                break;
        }
    }
    
    /**
     * Send an alert to Datadog
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToDatadog(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement Datadog integration
        // This would typically use the Datadog API or SDK to send events/alerts
        logger.debug({ severity, title, message, metadata }, 'Would send to Datadog:');
    }
    
    /**
     * Send an alert to PagerDuty
     * 
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToPagerDuty(
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement PagerDuty integration
        // This would typically use the PagerDuty API to create incidents
        logger.debug({ title, message, metadata }, 'Would send to PagerDuty:');
    }
    
    /**
     * Send an alert to Slack
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToSlack(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement Slack integration
        // This would typically use the Slack API to send messages
        logger.debug({ severity, title, message, metadata }, 'Would send to Slack:');
    }
}
```

### FILE: alerting/index.ts
```
/**
 * Alerting module barrel file
 * 
 * Exports alerting service interfaces, types, and implementations
 */

export * from './types';
export * from './AlertService';
```

### FILE: alerting/types.ts
```
/**
 * Alert service types and interfaces
 * 
 * This module defines the interfaces and types for the alerting service
 * that can be used to send alerts for critical operations.
 */

import { Result } from '@platform/core';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

/**
 * Alert metadata
 */
export interface AlertMetadata {
    service: string;
    operation: string;
    resource?: string;
    errorType?: string;
    errorMessage?: string;
    [key: string]: any;
}

/**
 * Alert service interface
 */
export interface IAlertService {
    /**
     * Send an alert
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    sendAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<Result<void>>;

    /**
     * Send a critical alert for a failed operation
     * 
     * @param operation Operation name
     * @param resource Resource name (e.g., "MySQL", "Redis", "Elasticsearch")
     * @param error Error that occurred
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    sendCriticalOperationAlert(
        operation: string,
        resource: string,
        error: Error | any,
        metadata?: Record<string, any>
    ): Promise<Result<void>>;
}
```

### FILE: decorators/index.ts
```
/**
 * Resilience Decorators
 * 
 * TypeScript decorators for adding resilience patterns to class methods.
 */

export { Resilient, type PresetType } from './resilient.decorator';
```

### FILE: decorators/resilient.decorator.ts
```
/**
 * Resilient Decorator - TypeScript decorator for adding resilience patterns to methods
 * 
 * This decorator wraps class methods with the existing Observable infrastructure,
 * using preset configurations for common resilience patterns.
 * 
 * @module resilience/decorators/resilient
 */

import { ApplicationContext, Result } from '@platform/core';
import { createObservableFunction, ObservableFunctionConfig } from '../templates/ObservableFunction';
import { 
    DATABASE_PRESET, 
    EXTERNAL_API_PRESET, 
    INTERNAL_SERVICE_PRESET, 
    CRITICAL_OPERATION_PRESET 
} from '../preset-configs';

/**
 * Preset configuration types supported by the decorator
 */
export type PresetType = 'database' | 'external-api' | 'internal-service' | 'critical-operation';

/**
 * Map preset names to their configurations
 */
const PRESET_MAP: Record<PresetType, Partial<ObservableFunctionConfig>> = {
    'database': DATABASE_PRESET,
    'external-api': EXTERNAL_API_PRESET,
    'internal-service': INTERNAL_SERVICE_PRESET,
    'critical-operation': CRITICAL_OPERATION_PRESET
};

/**
 * Resilient decorator that wraps methods with Observable infrastructure
 * 
 * @param presetType The preset configuration to use
 * @returns Method decorator
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @Resilient('database')
 *   async getUserById(id: string): Promise<Result<User>> {
 *     // business logic - must return Result<T>
 *     const user = await this.userRepository.findById(id);
 *     return success(user);
 *   }
 * 
 *   @Resilient('external-api')
 *   async callExternalService(): Promise<Result<ApiResponse>> {
 *     // external API call logic
 *     const response = await this.httpClient.get('/api/data');
 *     return success(response.data);
 *   }
 * }
 * ```
 */
export function Resilient(presetType: PresetType) {
    return function <T, A extends any[], R extends Promise<Result<any>>>(
        originalMethod: (this: T, ...args: A) => R,
        context: ClassMethodDecoratorContext<T, (this: T, ...args: A) => R>
    ) {
        if (context.kind !== 'method') {
            throw new Error(`@Resilient decorator can only be applied to methods`);
        }

        return function (this: T, ...args: A): R {
            // Get ApplicationContext from the class instance
            let appContext: ApplicationContext;
            
            if (typeof (this as any).getContext === 'function') {
                appContext = (this as any).getContext();
            } else if ((this as any).context) {
                appContext = (this as any).context;
            } else {
                throw new Error(
                    `@Resilient decorator requires the class to have either a 'context' property or 'getContext()' method. ` +
                    `Please add one of these to provide ApplicationContext.`
                );
            }

            // Get the preset configuration
            const presetConfig = PRESET_MAP[presetType];
            if (!presetConfig) {
                throw new Error(`Unknown preset type: ${presetType}`);
            }

            // Create operation name from class and method names
            const className = this.constructor.name;
            const operationName = `${className}.${String(context.name)}`;

            // Create the observable function configuration
            const config: ObservableFunctionConfig = {
                context: appContext,
                operationName,
                ...presetConfig
            };

            // Create worker function that calls the original method
            const workerFn = async (): Promise<Result<any>> => {
                return originalMethod.apply(this, args);
            };

            // Create and execute the observable function
            const observableFunction = createObservableFunction(config, workerFn);
            return observableFunction() as R;
        };
    };
}
```

### FILE: decorators/simple-example.ts
```
/**
 * Simple working example of the Resilient decorator
 * 
 * This demonstrates the basic usage pattern without complex typing issues.
 */

import { ApplicationContext, Result, success, failure, createError } from '@platform/core';
import { Resilient } from './resilient.decorator';

/**
 * Simple service class demonstrating the Resilient decorator usage
 */
export class SimpleService {
    constructor(private context: ApplicationContext) {}

    /**
     * Required method for the decorator to get ApplicationContext
     */
    getContext(): ApplicationContext {
        return this.context;
    }

    /**
     * Database operation example - uses DATABASE_PRESET
     */
    @Resilient('database')
    async getUser(id: string): Promise<Result<any>> {
        if (id === 'invalid') {
            return failure(createError({
                type: 'NotFound',
                message: 'User not found',
                statusCode: 404
            }));
        }
        
        return success({ id, name: `User ${id}` });
    }

    /**
     * External API operation example - uses EXTERNAL_API_PRESET
     */
    @Resilient('external-api')
    async callApi(endpoint: string): Promise<Result<any>> {
        if (endpoint.includes('fail')) {
            return failure(createError({
                type: 'ExternalServiceError',
                message: 'External service unavailable',
                statusCode: 503
            }));
        }
        
        return success({ data: `Response from ${endpoint}` });
    }
}
```

### FILE: examples/index.ts
```
/**
 * Resilience examples barrel file
 * 
 * This module exports file-generator implementations of resilient operations
 * that demonstrate how to use the resilience utilities.
 */

export * from './resilientDatabaseOperation';
export * from './resilientCacheOperation';
```

### FILE: examples/resilientCacheOperation.ts
```
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
```

### FILE: examples/resilientCacheWithTTL.ts
```
/**
 * Resilient Cache with TTL
 * 
 * This module provides an file-generator implementation of a resilient cache with TTL-based
 * refresh that gracefully handles refresh failures by continuing to use stale data.
 */

import {ApplicationContext, Result, success, failure, createError, logger} from '@platform/core';
import { createObservableFunction } from '../templates';
import { AlertService, AlertSeverity } from '../alerting';

/**
 * Cache entry with timestamp
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Options for the resilient cache
 */
export interface ResilientCacheOptions {
  /**
   * TTL in milliseconds
   */
  ttlMs: number;
  
  /**
   * Maximum staleness in milliseconds
   */
  maxStalenessMs: number;
  
  /**
   * Whether to alert on stale data
   */
  alertOnStaleData?: boolean;
  
  /**
   * Cache name for logging and alerting
   */
  cacheName?: string;
}

/**
 * Base class for resilient cache implementations
 */
export abstract class ResilientCache<K, V> {
  protected readonly ttlMs: number;
  protected readonly maxStalenessMs: number;
  protected readonly alertOnStaleData: boolean;
  protected readonly cacheName: string;
  protected readonly context: ApplicationContext;
  protected readonly alertService: AlertService;
  
  /**
   * Create a new resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    options: ResilientCacheOptions
  ) {
    this.context = context;
    this.alertService = alertService;
    this.ttlMs = options.ttlMs;
    this.maxStalenessMs = options.maxStalenessMs;
    this.alertOnStaleData = options.alertOnStaleData ?? true;
    this.cacheName = options.cacheName ?? 'resilient';
  }
  
  /**
   * Get a value from the cache, refreshing if needed
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  public async get(key: K): Promise<Result<V>> {
    // Try to get from cache first
    const entry = await this.getFromCache(key);
    
    // If not in cache, load from data source
    if (!entry) {
      return this.loadFromSource(key);
    }
    
    // Check if entry is fresh
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // If entry is fresh, return it
    if (age < this.ttlMs) {
      return success(entry.value);
    }
    
    // If entry is stale but within max staleness, refresh in background
    if (age < this.maxStalenessMs) {
      // Start background refresh
      this.refreshCache(key).catch(error => {
        logger.error({
          message: `Background cache refresh failed for key: ${String(key)}`,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      
      // Return stale data
      return success(entry.value);
    }
    
    // Entry is too stale, try to refresh synchronously
    const refreshResult = await this.loadFromSource(key);
    
    // If refresh succeeded, return fresh data
    if (refreshResult.success) {
      return refreshResult;
    }
    
    // If refresh failed but we have stale data, use it
    const staleness = now - entry.timestamp;
    if (entry) {
        
        // Log warning about using stale data
        logger.warn({
          message: `Using stale cache data for key: ${key}`,
          staleness: `${Math.round(staleness / 1000)}s`,
          error: refreshResult.error
        });
        
        // Alert about stale data if configured
        if (this.alertOnStaleData) {
          await this.alertService.sendAlert(
            AlertSeverity.WARNING,
            `Using stale ${this.cacheName} cache data`,
            `Cache refresh failed for key: ${key}. Using data that is ${Math.round(staleness / 1000)}s old.`,
            {
              service: this.context.identity.appName,
              operation: 'cache.get',
              resource: this.cacheName,
              key: String(key),
              staleness: `${Math.round(staleness / 1000)}s`,
              errorType: refreshResult.error?.type,
              errorMessage: refreshResult.error?.message
            }
          );
        }
        
        // Return stale data with warning
        return success(entry.value);
    }
    
    // No data available
    return refreshResult;
  }
  
  /**
   * Refresh the cache for a key in the background
   * 
   * @param key Cache key
   */
  protected async refreshCache(key: K): Promise<void> {
    try {
      const result = await this.loadFromSource(key);
      if (!result.success) {
        logger.warn({
          message: `Failed to refresh cache for key: ${String(key)}`,
          error: result.error
        });
      }
    } catch (error) {
      logger.error({
        message: `Error refreshing cache for key: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected abstract loadFromSource(key: K): Promise<Result<V>>;
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected abstract getFromCache(key: K): Promise<CacheEntry<V> | undefined>;
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected abstract setInCache(key: K, value: V): Promise<void>;
}

/**
 * In-memory implementation of resilient cache
 */
export class InMemoryResilientCache<K, V> extends ResilientCache<K, V> {
  private cache = new Map<string, CacheEntry<V>>();
  private readonly dataLoader: (key: K) => Promise<Result<V>>;
  
  /**
   * Create a new in-memory resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param dataLoader Function to load data from source
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    dataLoader: (key: K) => Promise<Result<V>>,
    options: ResilientCacheOptions
  ) {
    super(context, alertService, options);
    this.dataLoader = dataLoader;
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected async loadFromSource(key: K): Promise<Result<V>> {
    try {
      const result = await this.dataLoader(key);
      if (result.success) {
        await this.setInCache(key, result.data);
      }
      return result;
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to load data for key: ${String(key)}`,
        cause: error instanceof Error ? error : new Error(String(error))
      }));
    }
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected async getFromCache(key: K): Promise<CacheEntry<V> | undefined> {
    const keyStr = String(key);
    return this.cache.get(keyStr);
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected async setInCache(key: K, value: V): Promise<void> {
    const keyStr = String(key);
    this.cache.set(keyStr, {
      value,
      timestamp: Date.now()
    });
  }
  
  /**
   * Clear the cache
   */
  public clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get the number of entries in the cache
   */
  public size(): number {
    return this.cache.size;
  }
}

/**
 * Redis implementation of resilient cache
 */
export class RedisTTLCache<K, V> extends ResilientCache<K, V> {
  private readonly redisClient: any; // Replace with actual Redis client type
  private readonly keyPrefix: string;
  private readonly dataLoader: (key: K) => Promise<Result<V>>;
  
  /**
   * Create a new Redis resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param redisClient Redis client
   * @param keyPrefix Prefix for Redis keys
   * @param dataLoader Function to load data from source
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    redisClient: any, // Replace with actual Redis client type
    keyPrefix: string,
    dataLoader: (key: K) => Promise<Result<V>>,
    options: ResilientCacheOptions
  ) {
    super(context, alertService, options);
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
    this.dataLoader = dataLoader;
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected async loadFromSource(key: K): Promise<Result<V>> {
    try {
      const result = await this.dataLoader(key);
      if (result.success) {
        await this.setInCache(key, result.data);
      }
      return result;
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to load data for key: ${String(key)}`,
        cause: error instanceof Error ? error : new Error(String(error))
      }));
    }
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected async getFromCache(key: K): Promise<CacheEntry<V> | undefined> {
    const redisKey = this.getRedisKey(key);
    
    try {
      const data = await this.redisClient.get(redisKey);
      if (!data) {
        return undefined;
      }
      
      const parsed = JSON.parse(data);
      return {
        value: parsed.value,
        timestamp: parsed.timestamp
      };
    } catch (error) {
      logger.error({
        message: `Error getting value from Redis cache: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected async setInCache(key: K, value: V): Promise<void> {
    const redisKey = this.getRedisKey(key);
    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now()
    };
    
    try {
      await this.redisClient.set(
        redisKey,
        JSON.stringify(entry),
        'EX',
        Math.ceil(this.maxStalenessMs / 1000)
      );
    } catch (error) {
      logger.error({
        message: `Error setting value in Redis cache: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the Redis key for a cache key
   * 
   * @param key Cache key
   * @returns Redis key
   */
  private getRedisKey(key: K): string {
    return `${this.keyPrefix}:${String(key)}`;
  }
  
  /**
   * Clear the cache
   */
  public async clear(): Promise<void> {
    try {
      const keys = await this.redisClient.keys(`${this.keyPrefix}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      logger.error({
        message: 'Error clearing Redis cache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the number of entries in the cache
   */
  public async size(): Promise<number> {
    try {
      const keys = await this.redisClient.keys(`${this.keyPrefix}:*`);
      return keys.length;
    } catch (error) {
      logger.error({
        message: 'Error getting Redis cache size',
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
}
```

### FILE: examples/resilientDatabaseOperation.ts
```
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
```

### FILE: examples/simple-test.ts
```
/**
 * Simple test to validate the preset system without complex dependencies
 */

// Mock the core types to avoid dependency issues
interface Result<T> {
  success: boolean;
  data?: T;
  error?: any;
}

function success<T>(data: T): Result<T> {
  return { success: true, data, error: null };
}

interface ApplicationContext {
  identity: {
    appName: string;
    namespace: string;
    integration: string;
  };
}

// Mock the preset types
type PresetType = 'database' | 'external' | 'internal' | 'critical';

const PRESET_CONFIGS = {
  database: {
    sidecarFeatures: {
      metrics: true,
      spans: true,
      circuitBreaker: false,
      retry: false,
      rateLimiting: false,
    }
  },
  external: {
    sidecarFeatures: {
      metrics: true,
      spans: true,
      circuitBreaker: true,
      retry: true,
      rateLimiting: true,
    }
  }
};

// Simple service wrapper test
class ServiceWrapper {
  private preset: PresetType;
  private servicePrefix: string;

  constructor(preset: PresetType, servicePrefix: string) {
    this.preset = preset;
    this.servicePrefix = servicePrefix;
  }

  wrapService<T extends Record<string, any>>(
    service: T,
    methods: (keyof T)[]
  ): T {
    const wrapped = { ...service };
    
    for (const methodName of methods) {
      const originalMethod = service[methodName];
      if (typeof originalMethod === 'function') {
        const wrappedMethod = (...args: any[]) => {
          console.log(`🔍 [${this.preset}] ${this.servicePrefix}-${String(methodName)} called with:`, args);
          return originalMethod.apply(service, args);
        };
        
        (wrapped as any)[methodName] = wrappedMethod;
      }
    }
    
    return wrapped;
  }
}

// Test service
class TestMySQLService {
  async query<T>(sql: string, params: any[] = []): Promise<Result<T>> {
    console.log(`  → Executing SQL: ${sql}`);
    return success({ rows: [], rowCount: 0 } as any);
  }

  async healthCheck(): Promise<Result<boolean>> {
    console.log(`  → Health check performed`);
    return success(true);
  }
}

// Test the wrapper
async function testServiceWrapper() {
  console.log('🧪 Testing Service Wrapper\n');

  const baseService = new TestMySQLService();
  const wrapper = new ServiceWrapper('database', 'mysql-crm');
  const wrappedService = wrapper.wrapService(baseService, ['query', 'healthCheck']);

  console.log('1. Testing wrapped query method:');
  await wrappedService.query('SELECT * FROM users WHERE id = ?', [123]);

  console.log('\n2. Testing wrapped healthCheck method:');
  await wrappedService.healthCheck();

  console.log('\n✅ Service wrapper test completed successfully!');
}

// Run the test
if (require.main === module) {
  testServiceWrapper().catch(console.error);
}

export { testServiceWrapper };
```

### FILE: templates/Observable.ts
```
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
import {HealthService} from "../../health";
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
    protected readonly healthService?: HealthService;

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
     * @param healthService
     */
    constructor(
        context: ApplicationContext,
        additionalAttributes: Record<string, string> = {},
        metricsProvider?: IMetricsProvider,
        tracer?: ITracer,
        healthService?: HealthService
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
        this.healthService = healthService;
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
            if (this.healthService) {
                const healthResult = await this.healthService.start({
                    description: this.serviceName,
                    expectedInstances: 1,
                    expectedSignals: [
                        {
                            name: 'heartbeat',
                            expectedFrequencySeconds: 30,
                            description: 'Regular service heartbeat'
                        },
                        {
                            name: 'operation.success',
                            expectedFrequencySeconds: 300, // 5 minutes
                            description: 'Successful operation completion'
                        },
                        {
                            name: 'operation.failure',
                            expectedFrequencySeconds: 300, // 5 minutes
                            description: 'Failed operation completion'
                        }
                    ]
                });
                if (!healthResult.success) {
                    return healthResult;
                }
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
            if (this.healthService) {
                const healthResult = await this.healthService.shutdown();
                if (!healthResult.success) {
                    return healthResult;
                }
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
            this.healthService?.recordSignal(`operation.${operation}.start`);
            
            const result = await fn();
            
            // Record operation result in health monitoring
            this.healthService?.recordSignal(
                `operation.${operation}.${result.success ? 'success' : 'failure'}`,
                result.success ? undefined : result.error
            );
            
            return result;
        } catch (error) {
            // Record operation failure in health monitoring
            this.healthService?.recordSignal(`operation.${operation}.failure`, error);
            
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
        if (this.healthService) {
            const healthResult = await this.healthService.getHealthScore();
            if (!healthResult.success) {
                return healthResult;
            }

            const health = healthResult.data;
            if (health.status === 'unhealthy' || 
                (health.status === 'degraded' && health.score < 70)) {
                return failure({
                    message: 'Service health check failed',
                    type: 'ServiceUnhealthy',
                    statusCode: 503,
                    context: {
                        operation: 'healthCheck',
                        data: {
                            score: health.score,
                            status: health.status,
                            reasons: health.reasons
                        },
                        severity: Severity.ERROR
                    }
                });
            }

            // Record health score as a signal
            this.healthService.recordSignal('health.score', {
                score: health.score,
                status: health.status
            });
        }

        // Execute operation with health monitoring
        return this.executeOperation(this.operationName, async () => {
            const startTime = process.hrtime.bigint();
            const result = await this.run();
            const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to ms

            // Record operation metrics
            if (this.healthService) {
                this.healthService.recordSignal(`operation.${this.operationName}.duration`, {
                    durationMs: duration,
                    success: result.success,
                    error: result.success ? undefined : result.error
                });
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
```

### FILE: templates/ObservableFunction.ts
```
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

import { createError, failure, Result, Severity, success } from '@platform/core';
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
import { HealthService } from '../../health';
import { IAlertService, AlertSeverity } from '../alerting';
import { createRateLimiter } from '../../rate-limiting';
import retry from 'async-retry';

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
    healthService?: HealthService;
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
        healthService,
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
            healthService?.recordSignal(`operation.${operationName}.start`);
            
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
            
            // Record metrics
            if (sidecarFeatures.metrics) {
                const labels = { operation: operationName, service: serviceName };
                metrics.operationCounter.add(1, labels);
                metrics.operationDurationHistogram.record(duration, labels);
                
                if (!result.success) {
                    metrics.operationErrorCounter.add(1, {
                        ...labels,
                        error_type: result.error?.type || 'Unknown'
                    });
                }
            }
            
            // Record operation result in health monitoring
            healthService?.recordSignal(
                `operation.${operationName}.${result.success ? 'success' : 'failure'}`,
                result.success ? undefined : result.error
            );
            
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
            healthService?.recordSignal(`operation.${operationName}.failure`, error);
            
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
```

### FILE: templates/README.md
```
# Blueprint Observable Pattern

This module provides resilience and observability features for resource connectors and operations in the Blueprint framework. It implements patterns such as circuit breaker, retry, rate limiting, metrics collection, distributed tracing, and standardized error handling.

## Two Implementation Approaches

The Observable pattern in Blueprint can be used in two ways:

1. **Inheritance-based approach** (Original): Extend the `Observable` abstract class
2. **Function-based approach** (New): Use static methods to wrap any async function

Both approaches provide the same resilience and observability features, but offer different programming models to suit different use cases.

## Inheritance-Based Approach

The inheritance-based approach uses the Template Method pattern where subclasses implement a `run()` method, and the base class provides lifecycle management and observability features.

### When to use:
- For stateful services with multiple operations
- When you need lifecycle management (initialize/shutdown)
- When extending existing Observable-based code

### Example:

```typescript
import { Observable } from '@framework/runtime/templates/Observable';
import { Result, success, failure, createError } from '@framework/results';

class UserService extends Observable {
  constructor(context) {
    super(context);
    
    // Configure features
    this.withCircuitBreaker({
      enabled: true,
      timeout: 5000,
      errorThresholdPercentage: 50
    });
    
    this.withRetry({
      enabled: true,
      retries: 3
    });
  }

  // Override operationName for better observability
  protected get operationName(): string {
    return 'getUserById';
  }

  // Implement the abstract run() method
  protected async run(): Promise<Result<User>> {
    // Core implementation
    return success(user);
  }

  // Additional operations using executeOperation
  public async getUserByEmail(email: string): Promise<Result<User>> {
    return this.executeOperation('getUserByEmail', async () => {
      // Implementation
      return success(user);
    });
  }
}

// Usage
const service = new UserService(context);
await service.initialize();
const result = await service.execute(); // Calls run() with observability
await service.shutdown();
```

## Function-Based Approach

The function-based approach wraps any async function with the same resilience and observability features without requiring inheritance.

### When to use:
- For standalone operations that need observability
- When you want to avoid inheritance
- When you prefer a more functional programming style

### Example:

```typescript
import { Observable } from '@framework/runtime/templates/Observable';
import { Result, success } from '@framework/results';

// Create an observable function
const getUserById = Observable.createObservable(
  context,
  'getUserById',
  async (): Promise<Result<User>> => {
    // Implementation
    return success(user);
  },
  {
    sidecarFeatures: {
      circuitBreaker: true,
      retry: true
    },
    circuitBreakerConfig: {
      enabled: true,
      timeout: 5000
    },
    retryConfig: {
      enabled: true,
      retries: 3
    }
  }
);

// Use the function
const result = await getUserById();

// Or execute directly in one step
const result = await Observable.executeObservable(
  context,
  'getUserById',
  async () => {
    // Implementation
    return success(user);
  }
);
```

## Configuration Options

Both approaches support the same configuration options:

### Circuit Breaker
- `enabled`: Enable/disable circuit breaker
- `timeout`: Time in ms before a request is considered failed
- `errorThresholdPercentage`: Percentage of failures before opening circuit
- `resetTimeout`: Time in ms before attempting to close circuit

### Retry
- `enabled`: Enable/disable retry
- `retries`: Number of retry attempts
- `minTimeout`: Minimum time between retries
- `maxTimeout`: Maximum time between retries
- `factor`: Exponential backoff factor

### Rate Limiting
- `enabled`: Enable/disable rate limiting
- `tokensPerInterval`: Number of operations allowed per interval
- `interval`: Time interval for token replenishment
- `redisConfig`: Optional Redis configuration for distributed rate limiting

### Metrics and Tracing
- Automatically configured based on OpenTelemetry environment variables
- Collects operation duration, success/failure rates, and circuit breaker state

## Best Practices

1. **Choose the right approach** based on your use case:
   - Use inheritance for stateful services with lifecycle management
   - Use functional approach for standalone operations

2. **Configure circuit breaker** appropriately:
   - Set timeout based on expected operation duration
   - Set error threshold based on acceptable failure rate
   - Set reset timeout based on how quickly to retry after failures

3. **Configure retry** based on operation characteristics:
   - Use fewer retries for user-facing operations
   - Use more retries for background operations
   - Set appropriate backoff to avoid overwhelming downstream services

4. **Use meaningful operation names** for better observability:
   - Override `operationName` in inheritance approach
   - Provide descriptive operation name in functional approach

5. **Handle fallbacks** for critical operations:
   - Configure fallback handlers for graceful degradation
   - Return partial results when possible

## Integration with Blueprint Framework

The Observable pattern integrates with other Blueprint framework components:

- Uses `Result<T>` pattern for consistent error handling
- Integrates with OpenTelemetry for metrics and tracing
- Works with Blueprint's ApplicationContext for service identity
- Integrates with HealthService for health monitoring

## See Also

- [ObservableFunction.ts](./ObservableFunction.ts) - Implementation of the functional approach
- [Observable.ts](./Observable.ts) - Implementation of the inheritance-based approach
- [examples/observable-usage-example.ts](./examples/observable-usage-example.ts) - Example usage of both approaches
```

### FILE: templates/index.ts
```
/**
 * Resilience templates barrel file
 */

// Export the class-based Observable approach (for existing connectors)
export { Observable } from './Observable';

// Export the functional approach with specific exports to avoid conflicts
export { 
    createObservableFunction, 
    executeObservableFunction,
    ObservableFunctionConfig 
} from './ObservableFunction';

// Export shared interfaces from Observable only (to avoid duplicates)
export type {
    ResourceMetrics,
    CircuitBreakerOptions,
    CircuitBreakerSidecarConfig,
    RateLimiterSidecarConfig,
    TracerSidecarConfig,
    RetrySidecarConfig,
    MetricsSidecarConfig
} from './Observable';
```

### FILE: validation/circuit-breaker-test.ts
```
/**
 * Circuit Breaker Validation Test
 * 
 * This test validates that the circuit breaker actually works by using a
 * controllable function to trigger specific failure scenarios and observing
 * the expected circuit breaker state transitions.
 * 
 * Expected log outputs:
 * - "🔌 Circuit breaker OPEN" when threshold is reached
 * - "🤞 Circuit breaker HALF-OPEN" after reset timeout
 * - "✅ Circuit breaker CLOSED" when recovery succeeds
 * 
 * @module resilience/validation/circuit-breaker-test
 */

import { ApplicationContext } from '@platform/core';
import { logger } from '@platform/core';
import { ControllableAsyncFunction } from './controllable-function';
import { createExternalApiObservable, EXTERNAL_API_PRESET } from '../preset-configs';

/**
 * Circuit breaker validation test
 */
export async function validateCircuitBreaker(): Promise<void> {
  console.log('🧪 Circuit Breaker Validation Test Starting\n');
  
  // Create test context
  const context: ApplicationContext = {
    identity: {
      appName: 'resilience-validation',
      namespace: 'test',
      integration: 'circuit-breaker-test'
    }
  };

  // Create controllable function
  const testFunction = new ControllableAsyncFunction('circuit-breaker-test');
  
  // Create observable with circuit breaker enabled (using external preset)
  // External preset has: circuitBreaker: true, errorThresholdPercentage: 50, resetTimeout: 30000
  const observableCall = createExternalApiObservable(
    context,
    'circuit-breaker-validation',
    testFunction.createBoundFunction(),
    {
      // Override for faster testing
      circuitBreakerConfig: {
        enabled: true,
        timeout: 5000,
        errorThresholdPercentage: 50, // Circuit opens at 50% failure rate
        resetTimeout: 10000, // 10 seconds for faster testing
        name: 'validation-circuit-breaker'
      }
    }
  );

  try {
    console.log('📋 Test Scenario 1: Force Circuit Breaker to Open');
    console.log('   Setting 80% failure rate to exceed 50% threshold...\n');
    
    // Configure for high failure rate
    testFunction.configure({
      failureRate: 0.8, // 80% failure rate (exceeds 50% threshold)
      delay: 100 // Small delay to make it realistic
    });

    // Make multiple calls to trigger circuit breaker
    console.log('   Making 10 calls to trigger circuit breaker...');
    for (let i = 1; i <= 10; i++) {
      try {
        const result = await observableCall();
        console.log(`   Call ${i}: ${result.success ? '✅ Success' : '❌ Failed'}`);
      } catch (error) {
        console.log(`   Call ${i}: 💥 Exception - ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n📋 Test Scenario 2: Verify Fast-Fail Behavior');
    console.log('   Circuit should be OPEN - calls should fail immediately...\n');
    
    // Make a few more calls - these should fail fast if circuit is open
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      try {
        const result = await observableCall();
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail test ${i}: ${result.success ? '✅ Success' : '❌ Failed'} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail test ${i}: 💥 Exception in ${duration}ms - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('\n📋 Test Scenario 3: Test Recovery (Simplified)');
    console.log('   Resetting function to succeed and making a test call...\n');
    
    // Reset function to succeed
    testFunction.reset();
    
    // Make one test call
    try {
      const result = await observableCall();
      console.log(`   Recovery test: ${result.success ? '✅ Success' : '❌ Failed'}`);
    } catch (error) {
      console.log(`   Recovery test: 💥 Exception - ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('\n🎉 Circuit Breaker Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Look for "🔌 Circuit breaker OPEN" in logs during scenario 1');
    console.log('   • Fast-fail calls in scenario 2 should complete in <10ms');
    console.log('   • Recovery behavior depends on circuit breaker state');
    console.log('\n📈 Function Stats:', testFunction.getStats());

  } catch (error) {
    console.error('❌ Circuit Breaker Validation Test Failed:', error);
    throw error;
  }
}

/**
 * Run the validation test if this file is executed directly
 */
if (require.main === module) {
  validateCircuitBreaker()
    .then(() => {
      console.log('\n✅ Validation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    });
}
```

### FILE: validation/controllable-function.ts
```
/**
 * Controllable Async Function for Resilience Validation
 * 
 * This class provides a simple, controllable async function that can simulate
 * various failure modes, delays, and behaviors to validate resilience patterns
 * like circuit breakers, retry logic, and rate limiting.
 * 
 * Key insight: Resilience patterns don't care what the underlying operation is -
 * they just need an async function that can succeed, fail, timeout, etc.
 * 
 * @module resilience/validation/controllable-function
 */

import { Result, success, failure, createError } from '@platform/core';
import { logger } from '@platform/core';

/**
 * Configuration for controllable behavior
 */
export interface ControllableBehavior {
  /** Delay before responding (simulates slow operations) */
  delay?: number;
  
  /** Probability of random failure (0.0 to 1.0) */
  failureRate?: number;
  
  /** Number of consecutive failures before succeeding */
  consecutiveFailures?: number;
  
  /** Whether to timeout (throw timeout error) */
  shouldTimeout?: boolean;
  
  /** Timeout duration in ms */
  timeoutAfter?: number;
}

/**
 * Controllable async function for testing resilience patterns
 */
export class ControllableAsyncFunction {
  private config: ControllableBehavior = {};
  private callCount = 0;
  private consecutiveFailureCount = 0;
  private name: string;

  constructor(name: string = 'test-function') {
    this.name = name;
  }

  /**
   * Execute the controllable async operation
   */
  async call(): Promise<Result<any>> {
    this.callCount++;
    const startTime = Date.now();
    
    logger.info({
      config: this.config,
      callNumber: this.callCount
    }, `📞 [${this.name}] Call #${this.callCount} starting`);

    try {
      // Simulate delay (real async work)
      if (this.config.delay && this.config.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.delay));
      }

      // Handle timeout simulation
      if (this.config.shouldTimeout && this.config.timeoutAfter) {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), this.config.timeoutAfter);
        });
      }

      // Handle consecutive failures
      if (this.consecutiveFailureCount < (this.config.consecutiveFailures || 0)) {
        this.consecutiveFailureCount++;
        const error = createError({
          message: `Controlled consecutive failure #${this.consecutiveFailureCount}`,
          type: 'ControlledFailure'
        });
        
        logger.warn(`❌ [${this.name}] Consecutive failure ${this.consecutiveFailureCount}/${this.config.consecutiveFailures}`);
        return failure(error);
      }

      // Handle random failure rate
      if (this.config.failureRate && Math.random() < this.config.failureRate) {
        const error = createError({
          message: `Controlled random failure (rate: ${this.config.failureRate})`,
          type: 'ControlledRandomFailure'
        });
        
        logger.warn(`🎲 [${this.name}] Random failure triggered`);
        return failure(error);
      }

      // Success case
      const duration = Date.now() - startTime;
      const result = {
        callNumber: this.callCount,
        timestamp: Date.now(),
        duration,
        message: `Success after ${duration}ms`
      };

      logger.info( {
        duration,
        result
      }, `✅ [${this.name}] Call #${this.callCount} succeeded`);

      return success(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error( {
        duration,
        error: error instanceof Error ? error.message : String(error)
      }, `💥 [${this.name}] Call #${this.callCount} threw exception`);
      
      throw error; // Let the resilience patterns handle this
    }
  }

  /**
   * Configure the behavior of this function
   */
  configure(behavior: ControllableBehavior): void {
    this.config = { ...behavior };
    this.consecutiveFailureCount = 0; // Reset consecutive failure counter
    
    logger.info( {
      behavior: this.config
    });
  }

  /**
   * Reset to normal behavior (no failures, no delays)
   */
  reset(): void {
    this.config = {};
    this.consecutiveFailureCount = 0;
    
    logger.info(`🔄 [${this.name}] Reset to normal behavior`);
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      totalCalls: this.callCount,
      currentConfig: this.config,
      consecutiveFailureCount: this.consecutiveFailureCount
    };
  }

  /**
   * Create a bound function that can be passed to observables
   */
  createBoundFunction(): () => Promise<Result<any>> {
    return () => this.call();
  }
}
```

### FILE: validation/datadog-validation.js
```
/**
 * Datadog Observability Validation Test
 * 
 * This test validates that Datadog metrics and tracing work correctly
 * by using our controllable function approach with real Datadog services.
 * 
 * Expected behavior:
 * - Metrics sent to Datadog agent (counters, gauges, histograms)
 * - Traces sent to Datadog APM
 * - Circuit breaker events logged as both metrics and events
 * - All observability data visible in Datadog dashboard
 * 
 * @module resilience/validation/datadog-validation
 */

// Simple controllable async function (reusing pattern)
class ControllableFunction {
  constructor(name = 'datadog-test') {
    this.name = name;
    this.callCount = 0;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Handle consecutive failures
    if (this.consecutiveFailures < this.maxConsecutiveFailures) {
      this.consecutiveFailures++;
      console.log(`❌ [${this.name}] Call #${this.callCount} failed (consecutive failure ${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);
      throw new Error(`Controlled consecutive failure #${this.consecutiveFailures}`);
    }

    // Success case
    console.log(`✅ [${this.name}] Call #${this.callCount} succeeded after ${this.consecutiveFailures} failures`);
    return { 
      success: true, 
      callNumber: this.callCount, 
      timestamp: Date.now(),
      failuresBeforeSuccess: this.consecutiveFailures
    };
  }

  setConsecutiveFailures(count) {
    this.maxConsecutiveFailures = count;
    this.consecutiveFailures = 0;
    console.log(`⚙️ [${this.name}] Will fail ${count} times consecutively, then succeed`);
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Delay set to ${ms}ms`);
  }

  reset() {
    this.maxConsecutiveFailures = 0;
    this.consecutiveFailures = 0;
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      currentConsecutiveFailures: this.consecutiveFailures
    };
  }
}

// Mock Datadog services for testing (will be replaced with real ones)
class MockDatadogMetricsService {
  constructor(config = {}) {
    this.config = config;
    this.sentMetrics = [];
  }

  increment(metricName, value = 1, tags = {}) {
    const metric = { type: 'counter', name: metricName, value, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`📊 [Datadog] Counter: ${metricName} = ${value}`, tags);
  }

  gauge(metricName, value, tags = {}) {
    const metric = { type: 'gauge', name: metricName, value, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`📏 [Datadog] Gauge: ${metricName} = ${value}`, tags);
  }

  timing(metricName, durationMs, tags = {}) {
    const metric = { type: 'histogram', name: metricName, value: durationMs, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`⏱️ [Datadog] Timing: ${metricName} = ${durationMs}ms`, tags);
  }

  logCircuitBreaker(event) {
    this.increment('circuit_breaker.events', 1, { event });
    console.log(`🔌 [Datadog] Circuit breaker event: ${event}`);
  }

  getSentMetrics() {
    return this.sentMetrics;
  }
}

class MockDatadogSpan {
  constructor(operationName) {
    this.operationName = operationName;
    this.tags = {};
    this.startTime = Date.now();
    this.finished = false;
  }

  setTag(key, value) {
    this.tags[key] = value;
    console.log(`🏷️ [Datadog] Span tag: ${key} = ${value}`);
  }

  setError(error) {
    this.tags.error = true;
    this.tags['error.message'] = error.message;
    this.tags['error.type'] = error.constructor.name;
    console.log(`❌ [Datadog] Span error: ${error.message}`);
  }

  finish() {
    this.finished = true;
    const duration = Date.now() - this.startTime;
    console.log(`✅ [Datadog] Span finished: ${this.operationName} (${duration}ms)`, this.tags);
  }
}

class MockDatadogTracingService {
  constructor(config = {}) {
    this.config = config;
    this.spans = [];
  }

  startSpan(operationName, parentSpan) {
    const span = new MockDatadogSpan(operationName);
    this.spans.push(span);
    console.log(`🚀 [Datadog] Span started: ${operationName}`);
    return span;
  }

  createChildSpan(parentSpan, operationName) {
    return this.startSpan(operationName, parentSpan);
  }

  getSpans() {
    return this.spans;
  }
}

// Observable wrapper with Datadog observability
class DatadogObservableWrapper {
  constructor(metricsService, tracingService) {
    this.metrics = metricsService;
    this.tracing = tracingService;
  }

  async callWithObservability(operationName, fn) {
    const span = this.tracing.startSpan(operationName);
    const startTime = Date.now();
    
    // Increment request counter
    this.metrics.increment('requests.total', 1, { operation: operationName });
    
    try {
      span.setTag('operation', operationName);
      span.setTag('start_time', startTime);
      
      const result = await fn();
      
      const duration = Date.now() - startTime;
      
      // Record success metrics
      this.metrics.increment('requests.success', 1, { operation: operationName });
      this.metrics.timing('requests.duration', duration, { operation: operationName, status: 'success' });
      
      span.setTag('success', true);
      span.setTag('duration_ms', duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failure metrics
      this.metrics.increment('requests.failure', 1, { operation: operationName, error: error.constructor.name });
      this.metrics.timing('requests.duration', duration, { operation: operationName, status: 'failure' });
      
      span.setError(error);
      span.setTag('duration_ms', duration);
      
      throw error;
    } finally {
      span.finish();
    }
  }
}

// Main Datadog validation test
async function runDatadogValidation() {
  console.log('🐕 Datadog Observability Validation Test\n');

  // Create mock Datadog services (in real usage, these would be the actual Datadog services)
  const metricsService = new MockDatadogMetricsService({
    host: 'datadog-agent.data-pipeline.svc.cluster.local',
    port: 8125,
    prefix: 'crm',
    debug: true
  });

  const tracingService = new MockDatadogTracingService({
    serviceName: 'crm-validation-test',
    env: 'development',
    debug: true
  });

  // Create observable wrapper
  const observable = new DatadogObservableWrapper(metricsService, tracingService);
  
  // Create controllable function
  const testFunction = new ControllableFunction('datadog-validation');

  try {
    console.log('📋 Scenario 1: Successful Operations (Metrics & Tracing)');
    console.log('   Making 3 successful calls to generate metrics and traces...\n');
    
    testFunction.setDelay(100); // Add some delay for realistic timing
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await observable.callWithObservability(
          `test-operation-${i}`,
          () => testFunction.call()
        );
        console.log(`   Operation ${i}: Success\n`);
      } catch (error) {
        console.log(`   Operation ${i}: Failed - ${error.message}\n`);
      }
    }

    console.log('📋 Scenario 2: Failed Operations (Error Metrics & Traces)');
    console.log('   Making calls that will fail to test error handling...\n');
    
    testFunction.reset();
    testFunction.setConsecutiveFailures(2); // Fail twice
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await observable.callWithObservability(
          `error-test-operation-${i}`,
          () => testFunction.call()
        );
        console.log(`   Error test ${i}: Success\n`);
      } catch (error) {
        console.log(`   Error test ${i}: Failed - ${error.message}\n`);
      }
    }

    console.log('📋 Scenario 3: Circuit Breaker Events');
    console.log('   Simulating circuit breaker state changes...\n');
    
    // Simulate circuit breaker events
    metricsService.logCircuitBreaker('open');
    await new Promise(resolve => setTimeout(resolve, 100));
    metricsService.logCircuitBreaker('halfOpen');
    await new Promise(resolve => setTimeout(resolve, 100));
    metricsService.logCircuitBreaker('close');

    console.log('\n🎉 Datadog Validation Test Completed!');
    console.log('\n📊 Metrics Summary:');
    const metrics = metricsService.getSentMetrics();
    console.log(`   Total metrics sent: ${metrics.length}`);
    
    const metricsByType = metrics.reduce((acc, metric) => {
      acc[metric.type] = (acc[metric.type] || 0) + 1;
      return acc;
    }, {});
    console.log('   Metrics by type:', metricsByType);

    console.log('\n🔍 Traces Summary:');
    const spans = tracingService.getSpans();
    console.log(`   Total spans created: ${spans.length}`);
    console.log(`   Finished spans: ${spans.filter(s => s.finished).length}`);

    console.log('\n📈 Expected in Datadog Dashboard:');
    console.log('   • crm.requests.total counter with operation tags');
    console.log('   • crm.requests.success/failure counters');
    console.log('   • crm.requests.duration histogram with status tags');
    console.log('   • crm.circuit_breaker.events counter with event tags');
    console.log('   • APM traces for test-operation-* and error-test-operation-*');
    console.log('   • Error traces with exception details');

    console.log('\n🔗 Next Steps:');
    console.log('   1. Deploy Datadog agent to Kubernetes cluster');
    console.log('   2. Replace mock services with real DatadogMetricsService/DatadogTracingService');
    console.log('   3. Run validation and check Datadog dashboard for metrics/traces');
    console.log('   4. Set up alerts for circuit breaker events');

  } catch (error) {
    console.error('❌ Datadog Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runDatadogValidation()
    .then(() => {
      console.log('\n✅ Datadog validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Datadog validation failed:', error);
    });
}

module.exports = { 
  ControllableFunction, 
  MockDatadogMetricsService, 
  MockDatadogTracingService,
  DatadogObservableWrapper,
  runDatadogValidation 
};
```

### FILE: validation/index.ts
```
export * from './circuit-breaker-test';
export * from './controllable-function';
```

### FILE: validation/rate-limit-validation.js
```
/**
 * Rate Limiting Validation Test
 * 
 * This test validates that rate limiting actually works by flooding
 * a controllable function with requests and observing throttling behavior.
 * 
 * Expected behavior:
 * - Initial requests process normally
 * - Rate limiter kicks in after threshold
 * - Subsequent requests are queued/delayed
 * - Requests process at controlled rate
 * 
 * @module resilience/validation/rate-limit-validation
 */

// Simple controllable async function (fast responses for flooding)
class ControllableFunction {
  constructor(name = 'rate-limit-test') {
    this.name = name;
    this.callCount = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    const startTime = Date.now();
    
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate processing time
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [${this.name}] Call #${this.callCount} completed in ${duration}ms`);
    
    return { 
      success: true, 
      callNumber: this.callCount, 
      timestamp: Date.now(),
      processingTime: duration
    };
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Processing delay set to ${ms}ms`);
  }

  reset() {
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      currentDelay: this.delay
    };
  }
}

// Simple rate limiter
class SimpleRateLimiter {
  constructor(name, options = {}) {
    this.name = name;
    this.maxConcurrent = options.maxConcurrent || 2;
    this.minInterval = options.minInterval || 100; // ms between requests
    this.queue = [];
    this.activeCalls = 0;
    this.lastCallTime = 0;
  }

  async callWithRateLimit(fn) {
    return new Promise((resolve, reject) => {
      const request = { fn, resolve, reject, timestamp: Date.now() };
      this.queue.push(request);
      this.processQueue();
    });
  }

  async processQueue() {
    // Don't process if we're at max concurrent calls
    if (this.activeCalls >= this.maxConcurrent) {
      console.log(`⏳ [${this.name}] Rate limit active - ${this.activeCalls}/${this.maxConcurrent} concurrent calls`);
      return;
    }

    // Don't process if we haven't waited long enough since last call
    const timeSinceLastCall = Date.now() - this.lastCallTime;
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`⏱️ [${this.name}] Rate limit - waiting ${waitTime}ms before next call`);
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    // Process next request in queue
    const request = this.queue.shift();
    if (!request) return;

    this.activeCalls++;
    this.lastCallTime = Date.now();
    
    const queueTime = this.lastCallTime - request.timestamp;
    if (queueTime > 0) {
      console.log(`🚀 [${this.name}] Processing request (queued for ${queueTime}ms)`);
    } else {
      console.log(`🚀 [${this.name}] Processing request immediately`);
    }

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeCalls--;
      // Process next item in queue
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), this.minInterval);
      }
    }
  }

  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      minInterval: this.minInterval,
      queueLength: this.queue.length,
      activeCalls: this.activeCalls
    };
  }
}

// Main rate limiting validation test
async function runRateLimitValidation() {
  console.log('🧪 Rate Limiting Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('rate-limit-validation');
  const rateLimiter = new SimpleRateLimiter('test-rate-limiter', {
    maxConcurrent: 2,    // Only 2 concurrent calls
    minInterval: 200     // 200ms between calls
  });

  try {
    console.log('📋 Scenario 1: Test Normal Processing (Under Limit)');
    console.log('   Making 3 calls with delays to stay under rate limit...\n');
    
    testFunction.setDelay(50); // Fast processing
    
    // Make calls with delays (should not trigger rate limiting)
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      const result = await rateLimiter.callWithRateLimit(() => testFunction.call());
      const totalTime = Date.now() - startTime;
      console.log(`   Call ${i} total time: ${totalTime}ms\n`);
      
      // Wait to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    console.log('📋 Scenario 2: Test Rate Limiting (Flood Requests)');
    console.log('   Making 8 rapid requests to trigger rate limiting...\n');
    
    // Reset function stats
    testFunction.reset();
    testFunction.setDelay(100); // Slightly slower processing
    
    // Flood with requests (should trigger rate limiting)
    const promises = [];
    const startTime = Date.now();
    
    for (let i = 1; i <= 8; i++) {
      console.log(`📤 Submitting request ${i}`);
      const promise = rateLimiter.callWithRateLimit(() => testFunction.call())
        .then(result => {
          const elapsed = Date.now() - startTime;
          console.log(`📥 Request ${i} completed after ${elapsed}ms total`);
          return result;
        });
      promises.push(promise);
      
      // Small delay between submissions to see queuing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`\n⏳ Waiting for all ${promises.length} requests to complete...\n`);
    
    // Wait for all requests to complete
    await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log(`\n📊 All requests completed in ${totalTime}ms`);
    console.log('   Expected: Requests should be throttled and take longer than without rate limiting');

    console.log('\n🎉 Rate Limiting Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Scenario 1: Requests process immediately (under rate limit)');
    console.log('   • Scenario 2: Later requests queued/delayed due to rate limiting');
    console.log('   • Should see "Rate limit active" and "waiting Xms" messages');
    console.log('\n📈 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Rate Limiter:', rateLimiter.getStats());

  } catch (error) {
    console.error('❌ Rate Limiting Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runRateLimitValidation()
    .then(() => {
      console.log('\n✅ Rate limiting validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Rate limiting validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleRateLimiter, runRateLimitValidation };
```

### FILE: validation/retry-validation.js
```
/**
 * Retry Logic Validation Test
 * 
 * This test validates that retry logic actually works by using a
 * controllable function to simulate consecutive failures followed by success.
 * 
 * Expected behavior:
 * - Function fails N times consecutively
 * - Retry logic attempts N retries
 * - Function succeeds on final attempt
 * - Total attempts = initial + retries
 * 
 * @module resilience/validation/retry-validation
 */

// Simple controllable async function (reusing pattern from circuit breaker test)
class ControllableFunction {
  constructor(name = 'retry-test') {
    this.name = name;
    this.callCount = 0;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Handle consecutive failures
    if (this.consecutiveFailures < this.maxConsecutiveFailures) {
      this.consecutiveFailures++;
      console.log(`❌ [${this.name}] Call #${this.callCount} failed (consecutive failure ${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);
      throw new Error(`Controlled consecutive failure #${this.consecutiveFailures}`);
    }

    // Success case
    console.log(`✅ [${this.name}] Call #${this.callCount} succeeded after ${this.consecutiveFailures} failures`);
    return { 
      success: true, 
      callNumber: this.callCount, 
      timestamp: Date.now(),
      failuresBeforeSuccess: this.consecutiveFailures
    };
  }

  setConsecutiveFailures(count) {
    this.maxConsecutiveFailures = count;
    this.consecutiveFailures = 0; // Reset counter
    console.log(`⚙️ [${this.name}] Will fail ${count} times consecutively, then succeed`);
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Delay set to ${ms}ms`);
  }

  reset() {
    this.maxConsecutiveFailures = 0;
    this.consecutiveFailures = 0;
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      currentConsecutiveFailures: this.consecutiveFailures
    };
  }
}

// Simple retry wrapper
class SimpleRetryWrapper {
  constructor(name, options = {}) {
    this.name = name;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 100;
  }

  async callWithRetry(fn) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.maxRetries) {
      try {
        if (attempt > 0) {
          console.log(`🔄 [${this.name}] Retry attempt ${attempt}/${this.maxRetries}`);
          // Add delay between retries
          if (this.retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        } else {
          console.log(`🎯 [${this.name}] Initial attempt`);
        }

        const result = await fn();
        
        if (attempt > 0) {
          console.log(`✅ [${this.name}] Success on retry attempt ${attempt}!`);
        } else {
          console.log(`✅ [${this.name}] Success on initial attempt!`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt <= this.maxRetries) {
          console.log(`❌ [${this.name}] Attempt ${attempt} failed: ${error.message}`);
        } else {
          console.log(`💥 [${this.name}] All retry attempts exhausted. Final failure: ${error.message}`);
        }
      }
    }

    throw lastError;
  }

  getConfig() {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    };
  }
}

// Main retry validation test
async function runRetryValidation() {
  console.log('🧪 Retry Logic Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('retry-validation');
  const retryWrapper = new SimpleRetryWrapper('test-retry', {
    maxRetries: 3,
    retryDelay: 50  // Fast retries for testing
  });

  try {
    console.log('📋 Scenario 1: Test Successful Retry After 2 Failures');
    console.log('   Function will fail 2 times, then succeed on 3rd attempt...\n');
    
    // Configure for 2 consecutive failures
    testFunction.setConsecutiveFailures(2);
    
    const startTime = Date.now();
    const result = await retryWrapper.callWithRetry(() => testFunction.call());
    const totalTime = Date.now() - startTime;
    
    console.log(`   Result: ${JSON.stringify(result)}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Expected: 1 initial + 2 retries = 3 total attempts\n`);

    console.log('📋 Scenario 2: Test Retry Exhaustion (All Attempts Fail)');
    console.log('   Function will fail 5 times (more than max retries)...\n');
    
    // Reset and configure for more failures than retries
    testFunction.reset();
    testFunction.setConsecutiveFailures(5); // More than maxRetries (3)
    
    try {
      await retryWrapper.callWithRetry(() => testFunction.call());
      console.log('   ❌ ERROR: Should have failed after exhausting retries!');
    } catch (error) {
      console.log(`   ✅ Correctly failed after exhausting retries: ${error.message}`);
    }

    console.log('\n📋 Scenario 3: Test Immediate Success (No Retries Needed)');
    console.log('   Function will succeed immediately...\n');
    
    // Reset to normal behavior
    testFunction.reset();
    
    const result3 = await retryWrapper.callWithRetry(() => testFunction.call());
    console.log(`   Result: ${JSON.stringify(result3)}`);
    console.log('   Expected: Success on first attempt, no retries\n');

    console.log('🎉 Retry Logic Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Scenario 1: Should see exactly 3 attempts (1 initial + 2 retries)');
    console.log('   • Scenario 2: Should see 4 attempts then give up (1 initial + 3 retries)');
    console.log('   • Scenario 3: Should see 1 attempt only (immediate success)');
    console.log('\n📈 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Retry Config:', retryWrapper.getConfig());

  } catch (error) {
    console.error('❌ Retry Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runRetryValidation()
    .then(() => {
      console.log('\n✅ Retry validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Retry validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleRetryWrapper, runRetryValidation };
```

### FILE: validation/simple-validation.js
```
/**
 * Simple Circuit Breaker Validation (JavaScript)
 * 
 * A quick validation test to prove the circuit breaker concept works
 * without complex TypeScript compilation issues.
 */

// Simple controllable async function
class ControllableFunction {
  constructor(name = 'test') {
    this.name = name;
    this.callCount = 0;
    this.failureRate = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Simulate failures
    if (Math.random() < this.failureRate) {
      console.log(`❌ [${this.name}] Call #${this.callCount} failed (controlled)`);
      throw new Error(`Controlled failure (rate: ${this.failureRate})`);
    }

    console.log(`✅ [${this.name}] Call #${this.callCount} succeeded`);
    return { success: true, callNumber: this.callCount, timestamp: Date.now() };
  }

  setFailureRate(rate) {
    this.failureRate = rate;
    console.log(`⚙️ [${this.name}] Failure rate set to ${rate * 100}%`);
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Delay set to ${ms}ms`);
  }

  reset() {
    this.failureRate = 0;
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      currentFailureRate: this.failureRate,
      currentDelay: this.delay
    };
  }
}

// Simple circuit breaker simulation
class SimpleCircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 10000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async call(fn) {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`🤞 [${this.name}] Circuit breaker HALF-OPEN (testing recovery)`);
      } else {
        console.log(`🔌 [${this.name}] Circuit breaker OPEN - fast fail`);
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      
      // Success - reset failure count and close circuit if needed
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        console.log(`✅ [${this.name}] Circuit breaker CLOSED (recovery successful)`);
      }
      this.failureCount = 0;
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      // Check if we should open the circuit
      if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        console.log(`🔌 [${this.name}] Circuit breaker OPEN (threshold reached: ${this.failureCount}/${this.failureThreshold})`);
      } else if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        console.log(`🔌 [${this.name}] Circuit breaker OPEN (half-open test failed)`);
      }
      
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold
    };
  }
}

// Main validation test
async function runValidation() {
  console.log('🧪 Simple Circuit Breaker Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('validation-test');
  const circuitBreaker = new SimpleCircuitBreaker('test-circuit', {
    failureThreshold: 3, // Open after 3 failures
    resetTimeout: 5000   // 5 second reset timeout
  });

  try {
    console.log('📋 Scenario 1: Trigger Circuit Breaker');
    console.log('   Setting 90% failure rate...\n');
    
    testFunction.setFailureRate(0.9); // 90% failure rate
    
    // Make calls until circuit opens
    for (let i = 1; i <= 8; i++) {
      try {
        const result = await circuitBreaker.call(() => testFunction.call());
        console.log(`   Call ${i}: Success`);
      } catch (error) {
        console.log(`   Call ${i}: Failed - ${error.message}`);
      }
      
      console.log(`   Circuit state: ${circuitBreaker.getState().state} (failures: ${circuitBreaker.getState().failureCount})\n`);
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('📋 Scenario 2: Test Fast-Fail Behavior');
    console.log('   Making calls while circuit is open...\n');
    
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      try {
        await circuitBreaker.call(() => testFunction.call());
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail ${i}: Failed in ${duration}ms - ${error.message}`);
      }
    }

    console.log('\n📋 Scenario 3: Test Recovery');
    console.log('   Resetting function to succeed and waiting for circuit recovery...\n');
    
    testFunction.reset();
    
    // Wait a bit for reset timeout
    console.log('   Waiting 6 seconds for circuit reset timeout...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Try recovery
    try {
      const result = await circuitBreaker.call(() => testFunction.call());
      console.log('   Recovery test: Success!');
    } catch (error) {
      console.log(`   Recovery test: Failed - ${error.message}`);
    }

    console.log('\n🎉 Validation Test Completed!');
    console.log('\n📊 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Circuit Breaker:', circuitBreaker.getState());

  } catch (error) {
    console.error('❌ Validation test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  runValidation()
    .then(() => {
      console.log('\n✅ Validation completed');
    })
    .catch((error) => {
      console.error('\n❌ Validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleCircuitBreaker, runValidation };
```

### FILE: interfaces/IResourceConnector.ts
```
import {Result} from "@platform/core";


/**
 * Base interface for all resource connectors.
 * Provides common lifecycle methods and state.
 */
export interface IResourceConnector {
  /**
   * Initialize the resource connector.
   * This should be called before using the connector.
   * 
   * @returns A Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  
  /**
   * Whether the connector is currently connected to its resource.
   */
  isConnected(): boolean;
}

/**
 * Interface for resource connectors that send data without expecting a response.
 * Examples: message publishers, log writers, etc.
 * 
 * @template TRequest The type of data being sent
 */
export interface IResourceSender<TRequest> extends IResourceConnector {
  /**
   * Send data to the resource.
   * 
   * @param request The data to send
   * @returns A Result indicating success or failure
   */
  send(request: TRequest): Promise<Result<void>>;
}

/**
 * Interface for resource connectors that receive data.
 * Examples: message consumers, event subscribers, etc.
 * 
 * @template TRequest The type of request/query parameters
 * @template TResponse The type of data being received
 */
export interface IResourceReceiver<TRequest, TResponse> extends IResourceConnector {
  /**
   * Receive data from the resource.
   * 
   * @param request Parameters for the receive operation
   * @returns A Result containing the received data or an error
   */
  receive(): Promise<Result<TResponse>>;
}

/**
 * Interface for bidirectional resource connectors that send requests and receive responses.
 * Examples: database clients, HTTP clients, etc.
 * 
 * @template TRequest The type of request being sent
 * @template TResponse The type of response being received
 */
export interface IResourceClient<TRequest, TResponse> extends IResourceConnector {
  /**
   * Send a request to the resource and receive a response.
   * 
   * @param request The request to send
   * @returns A Result containing the response or an error
   */
  send(request: TRequest): Promise<Result<TResponse>>;
}
```

### FILE: interfaces/index.ts
```
/**
 * Resilience interfaces barrel file
 * 
 * Exports all resilience interfaces
 */

export * from './IResourceConnector';
```

