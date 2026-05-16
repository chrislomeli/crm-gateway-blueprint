/**
 * Metrics Service Factory
 * 
 * This file provides factory functions to create metrics publishing
 * without external dependencies.
 */

import { logger } from '@platform/core';
import { MetricsService } from './MetricsService';
import { NoopMetricsService } from './NoopMetricsService';
import { ConsoleMetricsService } from './ConsoleMetricsService';

export type MetricsConfig = {
  enabled: boolean;
  type: 'console' | 'noop';
  prefix?: string;
};

/**
 * Creates a metrics service based on configuration
 * 
 * @param config Metrics configuration
 * @returns A configured metrics service
 */
export function createMetricsService(config: MetricsConfig): MetricsService {
  if (!config.enabled) {
    logger.info({}, 'Metrics collection is disabled, using NoopMetricsService');
    return new NoopMetricsService();
  }

  switch (config.type) {
    case 'console':
      logger.info({}, 'Using ConsoleMetricsService for metrics');
      return new ConsoleMetricsService(config.prefix);
    
    case 'noop':
    default:
      logger.info({}, 'Using NoopMetricsService for metrics');
      return new NoopMetricsService();
  }
}

/**
 * Creates a no-op metrics service
 * @returns NoopMetricsService instance
 */
export function createNoopMetricsService(): MetricsService {
  return new NoopMetricsService();
}

/**
 * Creates a console metrics service
 * @param prefix Optional prefix for log messages
 * @returns ConsoleMetricsService instance
 */
export function createConsoleMetricsService(prefix?: string): MetricsService {
  return new ConsoleMetricsService(prefix);
}
