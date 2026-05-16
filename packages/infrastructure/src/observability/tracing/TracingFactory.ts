/**
 * Tracing Service Factory
 * 
 * This file provides factory functions to create tracing publishing
 * without external dependencies.
 */

import { logger } from '@platform/core';
import { TracingService, NoopTracingService, ConsoleTracingService } from './TracingService';

export type TracingConfig = {
  enabled: boolean;
  type: 'console' | 'noop';
};

/**
 * Creates a tracing service based on configuration
 * 
 * @param config Tracing configuration
 * @returns A configured tracing service
 */
export function createTracingService(config: TracingConfig): TracingService {
  if (!config.enabled) {
    logger.info({}, 'Tracing is disabled, using NoopTracingService');
    return new NoopTracingService();
  }

  switch (config.type) {
    case 'console':
      logger.info({}, 'Using ConsoleTracingService for tracing');
      return new ConsoleTracingService();
    
    case 'noop':
    default:
      logger.info({}, 'Using NoopTracingService for tracing');
      return new NoopTracingService();
  }
}

/**
 * Creates a no-op tracing service
 * @returns NoopTracingService instance
 */
export function createNoopTracingService(): TracingService {
  return new NoopTracingService();
}

/**
 * Creates a console tracing service
 * @returns ConsoleTracingService instance
 */
export function createConsoleTracingService(): TracingService {
  return new ConsoleTracingService();
}
