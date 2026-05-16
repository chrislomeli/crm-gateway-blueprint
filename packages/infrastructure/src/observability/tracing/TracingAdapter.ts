/**
 * Tracing Adapter
 * 
 * Adapts the TracingService interface to the ITracingProvider interface
 * This allows existing TracingService implementations to be used with the ObservabilityFactory
 */

import { ISpan, ITracer, ITracingProvider, SpanStatus } from '../interfaces/ITracingProvider';
import { TracingService, Span } from './TracingService';
import { logger } from '@platform/core';

/**
 * Span adapter that implements ISpan using the existing Span interface
 */
class SpanAdapter implements ISpan {
  constructor(private span: Span) {}

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.setTag(key, value);
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    Object.entries(attributes).forEach(([key, value]) => {
      this.span.setTag(key, value);
    });
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (status === SpanStatus.ERROR) {
      this.span.setError(new Error(message || 'Error in span'));
    }
  }

  recordException(exception: Error): void {
    this.span.setError(exception);
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    // Basic spans don't support events, so we add as tags
    this.span.setTag(`event.${name}`, 'true');
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        this.span.setTag(`event.${name}.${key}`, value);
      });
    }
  }

  end(): void {
    this.span.finish();
  }
}

/**
 * Tracer adapter that implements ITracer using TracingService
 */
class TracerAdapter implements ITracer {
  constructor(
    private tracingService: TracingService,
    private name: string
  ) {}

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): ISpan {
    const span = this.tracingService.startSpan(name);
    const spanAdapter = new SpanAdapter(span);
    
    if (attributes) {
      spanAdapter.setAttributes(attributes);
    }
    
    return spanAdapter;
  }
}

/**
 * Adapter that implements ITracingProvider using a TracingService
 */
export class TracingAdapter implements ITracingProvider {
  private tracers: Map<string, ITracer> = new Map();

  constructor(private tracingService: TracingService) {}

  getTracer(name: string, version?: string): ITracer {
    const tracerName = version ? `${name}@${version}` : name;
    
    if (!this.tracers.has(tracerName)) {
      this.tracers.set(tracerName, new TracerAdapter(this.tracingService, tracerName));
    }
    
    return this.tracers.get(tracerName)!;
  }

  async shutdown(): Promise<void> {
    // No explicit shutdown needed for basic TracingService
    logger.debug('Shutting down tracing adapter');
    return Promise.resolve();
  }
}
