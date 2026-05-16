/**
 * Observability Factory
 * 
 * Centralized factory for observability publishing with support for multiple providers:
 * - Console (development)
 * - Datadog (production)
 * - No-op (testing/disabled)
 */

import { logger } from '@platform/core';
import { 
  MetricsService, 
  createMetricsService, 
  MetricsConfig, 
  NoopMetricsService,
  MetricsAdapter,
  ConsoleMetricsService,
  DatadogMetricsService,
  DatadogConfig as DatadogMetricsConfig
} from './metrics';
import { 
  TracingService, 
  createTracingService, 
  TracingConfig, 
  NoopTracingService,
  TracingAdapter,
  ConsoleTracingService,
  DatadogTracingService,
  DatadogTracingConfig
} from './tracing';
import { IMetricsProvider } from './interfaces/IMetricsProvider';
import { ITracingProvider } from './interfaces/ITracingProvider';

export type ObservabilityProvider = 'console' | 'datadog' | 'opentelemetry' | 'noop';

export type ObservabilityConfig = {
  provider: ObservabilityProvider;
  metrics: MetricsConfig;
  tracing: TracingConfig;
  datadog?: {
    metrics?: DatadogMetricsConfig;
    tracing?: DatadogTracingConfig;
  };
};

// Singleton instances for global access
let metricsInstance: IMetricsProvider | null = null;
let tracingInstance: ITracingProvider | null = null;

/**
 * ObservabilityFactory class with static methods for accessing observability publishing
 * This provides a singleton pattern for accessing metrics and tracing publishing
 */
export class ObservabilityFactory {
  /**
   * Initialize observability publishing with the given configuration
   * @param config Observability configuration
   */
  public static async initialize(config: ObservabilityConfig): Promise<void> {
    logger.debug({ config }, 'Initializing observability publishing');

    const services = createObservabilityServices(config);
    metricsInstance = new MetricsAdapter(services.metrics);
    tracingInstance = new TracingAdapter(services.tracing);
  }

  /**
   * Get the metrics provider instance
   * @returns The metrics provider instance
   */
  public static getMetricsProvider(): IMetricsProvider {
    if (!metricsInstance) {
      logger.warn('Metrics provider not initialized, returning NoopMetricsService');
      metricsInstance = new MetricsAdapter(new NoopMetricsService());
    }
    return metricsInstance;
  }

  /**
   * Get the tracing provider instance
   * @returns The tracing provider instance
   */
  public static getTracingProvider(): ITracingProvider {
    if (!tracingInstance) {
      logger.warn('Tracing provider not initialized, returning NoopTracingService');
      tracingInstance = new TracingAdapter(new NoopTracingService());
    }
    return tracingInstance;
  }

  /**
   * Reset the singleton instances (useful for testing)
   */
  public static reset(): void {
    metricsInstance = null;
    tracingInstance = null;
  }
}

/**
 * Creates and configures observability publishing
 * @param config Observability configuration
 * @returns Object containing metrics and tracing publishing
 */
export function createObservabilityServices(config: ObservabilityConfig) {
  logger.debug({ config }, 'Creating observability publishing');

  let metricsService: MetricsService;
  let tracingService: TracingService;

  switch (config.provider) {
    case 'console':
      metricsService = new ConsoleMetricsService();
      tracingService = new ConsoleTracingService();
      break;
    case 'datadog':
      if (!config.datadog) {
        throw new Error('Datadog configuration is required when provider is "datadog"');
      }
      metricsService = new DatadogMetricsService(config.datadog.metrics);
      tracingService = new DatadogTracingService(config.datadog.tracing);
      break;
    case 'opentelemetry':
      // OpenTelemetry not implemented yet - fall back to console with warning
      logger.warn('OpenTelemetry provider not implemented yet, falling back to console provider');
      metricsService = new ConsoleMetricsService();
      tracingService = new ConsoleTracingService();
      break;
    case 'noop':
      metricsService = new NoopMetricsService();
      tracingService = new NoopTracingService();
      break;
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }

  return {
    metrics: metricsService,
    tracing: tracingService
  };
}

/**
 * Creates observability publishing with default configuration for development
 * @returns Object containing console-based observability publishing
 */
export function createDevelopmentObservabilityServices() {
  return createObservabilityServices({
    provider: 'console',
    metrics: {
      enabled: true,
      type: 'console',
      prefix: '[DEV] '
    },
    tracing: {
      enabled: true,
      type: 'console'
    }
  });
}

/**
 * Creates disabled observability publishing (no-op implementations)
 * @returns Object containing no-op observability publishing
 */
export function createDisabledObservabilityServices() {
  return createObservabilityServices({
    provider: 'noop',
    metrics: {
      enabled: false,
      type: 'noop'
    },
    tracing: {
      enabled: false,
      type: 'noop'
    }
  });
}
