/**
 * Resilience templates barrel file
 */

// Export the class-based Observable approach (for existing connectors)
export { Observable } from './Observable';

// Export the functional approach with specific exports to avoid conflicts
export { 
    createObservableFunction, 
    executeObservableFunction,
    ObservableFunctionConfig 
} from './ObservableFunction';

// Export shared interfaces from Observable only (to avoid duplicates)
export type {
    ResourceMetrics,
    CircuitBreakerOptions,
    CircuitBreakerSidecarConfig,
    RateLimiterSidecarConfig,
    TracerSidecarConfig,
    RetrySidecarConfig,
    MetricsSidecarConfig
} from './Observable';
