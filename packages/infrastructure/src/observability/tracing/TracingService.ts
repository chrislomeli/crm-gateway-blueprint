/**
 * Generic tracing service interface
 */

export interface Span {
  setTag(key: string, value: string | number | boolean): void;
  setError(error: Error): void;
  finish(): void;
}

export interface TracingService {
  startSpan(operationName: string, parentSpan?: Span): Span;
  createChildSpan(parentSpan: Span, operationName: string): Span;
}

/**
 * No-operation span implementation
 */
export class NoopSpan implements Span {
  setTag(key: string, value: string | number | boolean): void {
    // No-op
  }

  setError(error: Error): void {
    // No-op
  }

  finish(): void {
    // No-op
  }
}

/**
 * No-operation tracing service
 */
export class NoopTracingService implements TracingService {
  startSpan(operationName: string, parentSpan?: Span): Span {
    return new NoopSpan();
  }

  createChildSpan(parentSpan: Span, operationName: string): Span {
    return new NoopSpan();
  }
}

/**
 * Console-based tracing service for development
 */
export class ConsoleSpan implements Span {
  private startTime: number;
  private tags: Record<string, string | number | boolean> = {};
  private traceState: string = 'started';

  constructor(private operationName: string) {
    this.startTime = Date.now();
    console.log(`[TRACE] Started span: ${operationName}`);
  }

  setTag(key: string, value: string | number | boolean): void {
    this.tags[key] = value;
    
    // Capture trace state for enhanced output
    if (key === 'trace.state') {
      this.traceState = String(value);
    }
  }

  setError(error: Error): void {
    this.traceState = 'failed';
    console.error(`[TRACE] ❌ Error in span ${this.operationName}:`, error.message);
  }

  finish(): void {
    const duration = Date.now() - this.startTime;
    
    // Enhanced console output with trace state indicators
    const stateIndicator = this.getStateIndicator(this.traceState);
    const stateLabel = `[${this.traceState.toUpperCase()}]`;
    
    console.log(`[TRACE] ${stateIndicator} Finished span: ${this.operationName} (${duration}ms) ${stateLabel}`, this.tags);
  }

  private getStateIndicator(state: string): string {
    switch (state) {
      case 'success':
        return '✅';
      case 'noop':
        return '⚪';
      case 'accepted':
        return '🔄';
      case 'failed':
        return '❌';
      default:
        return '📊';
    }
  }
}

export class ConsoleTracingService implements TracingService {
  startSpan(operationName: string, parentSpan?: Span): Span {
    return new ConsoleSpan(operationName);
  }

  createChildSpan(parentSpan: Span, operationName: string): Span {
    return new ConsoleSpan(operationName);
  }
}
