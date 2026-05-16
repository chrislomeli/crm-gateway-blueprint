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
