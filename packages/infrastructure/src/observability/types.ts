/**
 * Observability Types
 * 
 * Common types used across the observability module
 */

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Context for logging and tracing
export interface LogContext {
    traceId?: string;
    spanId?: string;
    serviceName?: string;
    [key: string]: any;
}

// Re-export types from interfaces for convenience
export type { 
    IMetricsProvider, 
    ICounter, 
    IGauge, 
    IHistogram 
} from './interfaces/IMetricsProvider';

export type {
    ITracingProvider,
    ITracer,
    ISpan,
    SpanStatus
} from './interfaces/ITracingProvider';
