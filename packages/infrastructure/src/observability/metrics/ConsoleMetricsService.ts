import { MetricsService } from './MetricsService';
import { logger } from '@platform/core';

export class ConsoleMetricsService implements MetricsService {
    constructor(private prefix = '') {}

    increment(metric: string, value = 1, tags: Record<string, string> = {}) {
        logger.debug({ metric, value, tags }, `${this.prefix}INCREMENT`);
    }

    gauge(metric: string, value: number, tags: Record<string, string> = {}) {
        logger.debug({ metric, value, tags }, `${this.prefix}GAUGE`);
    }

    timing(metric: string, durationMs: number, tags: Record<string, string> = {}) {
        logger.debug({ metric, durationMs, tags }, `${this.prefix}TIMING`);
    }

    logCircuitBreaker(event: 'open' | 'halfOpen' | 'close' | 'failure') {
        logger.warn({ event }, `${this.prefix}Circuit breaker event`);
    }
}