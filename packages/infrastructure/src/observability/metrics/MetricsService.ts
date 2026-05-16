export interface MetricsService {
    increment(metricName: string, value?: number, tags?: Record<string, string>): void;
    gauge(metricName: string, value: number, tags?: Record<string, string>): void;
    timing(metricName: string, durationMs: number, tags?: Record<string, string>): void;
    logCircuitBreaker(event: 'open' | 'halfOpen' | 'close' | 'failure'): void;
}