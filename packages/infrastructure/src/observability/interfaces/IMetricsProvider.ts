/**
 * Metrics Provider Interface
 * 
 * Defines the contract for metrics collection providers.
 * Supports counters, gauges, and histograms with labels.
 * Implementation-agnostic - can be backed by OpenTelemetry, Datadog, etc.
 */

export interface ICounter {
  /**
   * Increment counter by 1 or specified value
   */
  add(value?: number, labels?: Record<string, string>): void;
}

export interface IGauge {
  /**
   * Set gauge to specific value
   */
  set(value: number, labels?: Record<string, string>): void;
  
  /**
   * Add to current gauge value
   */
  add(value: number, labels?: Record<string, string>): void;
}

export interface IHistogram {
  /**
   * Record a value in the histogram
   */
  record(value: number, labels?: Record<string, string>): void;
}

export interface IMetricsProvider {
  /**
   * Create or get a counter metric
   */
  createCounter(name: string, description?: string): ICounter;
  
  /**
   * Create or get a gauge metric
   */
  createGauge(name: string, description?: string): IGauge;
  
  /**
   * Create or get a histogram metric
   */
  createHistogram(name: string, description?: string, unit?: string): IHistogram;
  
  /**
   * Shutdown the metrics provider
   */
  shutdown(): Promise<void>;
}
