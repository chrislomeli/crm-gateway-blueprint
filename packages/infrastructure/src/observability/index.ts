/**
 * Observability Module
 * 
 * This module provides a unified interface for metrics and tracing
 * with implementation-agnostic abstractions that can be backed by
 * various providers (Console, OpenTelemetry, etc.)
 * 
 * Key components:
 * - Metrics: Counters, gauges, and histograms
 * - Tracing: Distributed tracing with spans
 * - Factory: Configuration and creation of observability publishing
 */

// Export interfaces
export * from './interfaces';

// Export metrics
export * from './metrics';

// Export tracing
export * from './tracing';

// Export factory and configuration
export * from './observabilityFactory';
export * from './types';

// Export shutdown utilities
export * from './Shutdown';
