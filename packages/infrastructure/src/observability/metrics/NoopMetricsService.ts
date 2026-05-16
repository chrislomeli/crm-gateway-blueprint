import { MetricsService } from './MetricsService';

/**
 * No-operation metrics service that discards all metrics
 * Useful for testing or when metrics are disabled
 */
export class NoopMetricsService implements MetricsService {
  increment(metricName: string, value?: number, tags?: Record<string, string>): void {
    // No-op
  }

  gauge(metricName: string, value: number, tags?: Record<string, string>): void {
    // No-op
  }

  timing(metricName: string, durationMs: number, tags?: Record<string, string>): void {
    // No-op
  }

  logCircuitBreaker(event: 'open' | 'halfOpen' | 'close' | 'failure'): void {
    // No-op
  }
}
