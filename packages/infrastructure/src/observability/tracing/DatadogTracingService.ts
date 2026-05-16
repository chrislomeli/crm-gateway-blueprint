/**
 * Datadog Tracing Service
 * 
 * Implements the TracingService interface using Datadog's APM (dd-trace).
 * Sends traces to the Datadog agent via HTTP on port 8126.
 * 
 * Features:
 * - Distributed tracing with spans
 * - Automatic service mapping
 * - Error tracking
 * - Custom tags and attributes
 * 
 * @module observability/tracing/DatadogTracingService
 */

import { TracingService, Span } from './TracingService';
import { logger } from '@platform/core';

// Type definitions for dd-trace (since we might not have @types/dd-trace)
interface DDSpan {
  setTag(key: string, value: any): DDSpan;
  addTags(tags: Record<string, any>): DDSpan;
  setOperationName(name: string): DDSpan;
  log(fields: Record<string, any>, timestamp?: number): DDSpan;
  finish(finishTime?: number): void;
  context(): any;
}

interface DDTracer {
  startSpan(operationName: string, options?: any): DDSpan;
  scope(): any;
}

export interface DatadogTracingConfig {
  /** Service name for traces */
  serviceName?: string;
  /** Environment (development, staging, production) */
  env?: string;
  /** Service version */
  version?: string;
  /** Datadog agent host */
  agentHost?: string;
  /** Datadog agent port */
  agentPort?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Global tags for all spans */
  globalTags?: Record<string, string>;
}

/**
 * Datadog implementation of Span
 */
export class DatadogSpan implements Span {
  constructor(
    private ddSpan: DDSpan,
    private config: Required<DatadogTracingConfig>
  ) {}

  setTag(key: string, value: string | number | boolean): void {
    this.ddSpan.setTag(key, value);
    
    if (this.config.debug) {
      logger.debug({ key, value }, '🏷️ Datadog span tag set');
    }
  }

  setError(error: Error): void {
    this.ddSpan.setTag('error', true);
    this.ddSpan.setTag('error.message', error.message);
    this.ddSpan.setTag('error.stack', error.stack);
    this.ddSpan.setTag('error.type', error.constructor.name);
    
    if (this.config.debug) {
      logger.debug({ 
        message: error.message,
        type: error.constructor.name 
      }, '❌ Datadog span error set');
    }
  }

  finish(): void {
    this.ddSpan.finish();
    
    if (this.config.debug) {
      logger.debug({}, '✅ Datadog span finished');
    }
  }

  /**
   * Add multiple tags at once
   */
  addTags(tags: Record<string, any>): void {
    this.ddSpan.addTags(tags);
    
    if (this.config.debug) {
      logger.debug({ tags }, '🏷️ Datadog span tags added');
    }
  }

  /**
   * Log structured data to the span
   */
  log(fields: Record<string, any>, timestamp?: number): void {
    this.ddSpan.log(fields, timestamp);
    
    if (this.config.debug) {
      logger.debug({ fields, timestamp }, '📝 Datadog span log');
    }
  }

  /**
   * Get the underlying Datadog span (for advanced usage)
   */
  getDatadogSpan(): DDSpan {
    return this.ddSpan;
  }
}

/**
 * Datadog implementation of TracingService
 */
export class DatadogTracingService implements TracingService {
  private tracer: DDTracer | null = null;
  private config: Required<DatadogTracingConfig>;

  constructor(config: DatadogTracingConfig = {}) {
    this.config = {
      serviceName: config.serviceName || 'crm-service',
      env: config.env || 'development',
      version: config.version || '1.0.0',
      agentHost: config.agentHost || 'datadog-agent.data-pipeline.svc.cluster.local',
      agentPort: config.agentPort || 8126,
      debug: config.debug || false,
      globalTags: config.globalTags || {}
    };

    this.initializeTracer().catch(error => {
      logger.warn({ error: error.message }, 'Failed to initialize Datadog tracer');
      this.tracer = null;
    });
  }

  /**
   * Initialize the Datadog tracer
   */
  private async initializeTracer(): Promise<void> {
    try {
      // Try to import dd-trace dynamically for optional dependency
      const ddTrace = await import('dd-trace');
      
      this.tracer = ddTrace.init({
        service: this.config.serviceName,
        env: this.config.env,
        version: this.config.version,
        hostname: this.config.agentHost,
        port: this.config.agentPort,
        tags: this.config.globalTags,
        // Enable automatic instrumentation
        plugins: true,
        // Sample rate (1.0 = 100% of traces)
        sampleRate: 1.0
      });

      if (this.config.debug) {
        logger.info({
          service: this.config.serviceName,
          env: this.config.env,
          agentHost: this.config.agentHost,
          agentPort: this.config.agentPort
        }, '🔍 Datadog tracer initialized');
      }
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize Datadog tracer - dd-trace not available');
      
      // Fall back to no-op behavior
      this.tracer = null;
    }
  }

  /**
   * Start a new span
   */
  startSpan(operationName: string, parentSpan?: Span): Span {
    if (!this.tracer) {
      // Return no-op span if tracer not available
      return new NoopDatadogSpan();
    }

    const options: any = {};
    
    // If parent span provided, set it as parent
    if (parentSpan && parentSpan instanceof DatadogSpan) {
      options.childOf = parentSpan.getDatadogSpan().context();
    }

    const ddSpan = this.tracer.startSpan(operationName, options);
    
    // Add global tags
    if (Object.keys(this.config.globalTags).length > 0) {
      ddSpan.addTags(this.config.globalTags);
    }

    if (this.config.debug) {
      logger.debug({ 
        operationName,
        hasParent: !!parentSpan 
      }, '🚀 Datadog span started');
    }

    return new DatadogSpan(ddSpan, this.config);
  }

  /**
   * Create a child span from a parent span
   */
  createChildSpan(parentSpan: Span, operationName: string): Span {
    return this.startSpan(operationName, parentSpan);
  }

  /**
   * Get the current active span (if any)
   */
  getActiveSpan(): Span | null {
    if (!this.tracer) {
      return null;
    }

    try {
      const activeSpan = this.tracer.scope().active();
      return activeSpan ? new DatadogSpan(activeSpan, this.config) : null;
    } catch (error) {
      if (this.config.debug) {
        logger.debug({
          error: error instanceof Error ? error.message : String(error)
        }, 'No active span available');
      }
      return null;
    }
  }

  /**
   * Execute a function within a span context
   */
  async withSpan<T>(operationName: string, fn: (span: Span) => Promise<T>): Promise<T> {
    const span = this.startSpan(operationName);
    
    try {
      const result = await fn(span);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.setError(error);
      }
      throw error;
    } finally {
      span.finish();
    }
  }

  /**
   * Get tracer configuration
   */
  getConfig(): Required<DatadogTracingConfig> {
    return { ...this.config };
  }
}

/**
 * No-op span implementation for when dd-trace is not available
 */
class NoopDatadogSpan implements Span {
  setTag(key: string, value: string | number | boolean): void {
    // No-op
  }

  setError(error: Error): void {
    // No-op
  }

  finish(): void {
    // No-op
  }

  addTags(tags: Record<string, any>): void {
    // No-op
  }

  log(fields: Record<string, any>, timestamp?: number): void {
    // No-op
  }

  getDatadogSpan(): any {
    return null;
  }
}
