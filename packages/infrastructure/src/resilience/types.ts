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
