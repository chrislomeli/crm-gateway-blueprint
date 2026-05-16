/**
 * Tracing Provider Interface
 * 
 * Defines the contract for distributed tracing providers.
 * Implementation-agnostic - can be backed by OpenTelemetry, Datadog, etc.
 */

export enum SpanStatus {
  OK = 'OK',
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT'
}

export interface ISpan {
  /**
   * Set an attribute on the span
   */
  setAttribute(key: string, value: string | number | boolean): void;
  
  /**
   * Set multiple attributes on the span
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  
  /**
   * Set the span status
   */
  setStatus(status: SpanStatus, message?: string): void;
  
  /**
   * Record an exception on the span
   */
  recordException(exception: Error): void;
  
  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  
  /**
   * End the span
   */
  end(): void;
}

export interface ITracer {
  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): ISpan;
}

export interface ITracingProvider {
  /**
   * Get a tracer for the specified component
   */
  getTracer(name: string, version?: string): ITracer;
  
  /**
   * Shutdown the tracing provider
   */
  shutdown(): Promise<void>;
}
