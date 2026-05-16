/**
 * Metrics Module
 * 
 * Generic metrics interfaces and implementations without external dependencies
 */

// Export core interfaces and implementations
export * from './MetricsService';
export * from './ConsoleMetricsService';
export * from './NoopMetricsService';
export * from './DatadogMetricsService';
export * from './MetricsAdapter';
export * from './MetricsFactory';