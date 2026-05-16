# Observability Configuration Design

## Overview

Simple, environment-aware observability configuration that provides metrics visibility in all environments while keeping complexity minimal.

## Configuration Strategy

### ConfigMap Structure

```yaml
# config/shared/shared.yaml
observability:
  metrics:
    provider: "console"  # datadog | console | file
    console:
      enabled: true
      format: "pretty"   # json | pretty
    file:
      enabled: false
      path: "/tmp/metrics.log"
    datadog:
      host: "datadog-agent.acme-infrastructure.svc.cluster.local"
      port: 8125
  tracing:
    provider: "console"  # datadog | console | noop
    console:
      enabled: true
      format: "pretty"
    datadog:
      host: "datadog-agent.acme-infrastructure.svc.cluster.local" 
      port: 8126
```

### Environment-Specific Overrides

**Local Development** (`config/shared/shared.yaml`):
```yaml
observability:
  metrics:
    provider: "console"
    console:
      enabled: true
      format: "pretty"
  tracing:
    provider: "console"
```

**K8s Production** (Helm values or ConfigMap override):
```yaml
observability:
  metrics:
    provider: "datadog"
    datadog:
      host: "datadog-agent.acme-infrastructure.svc.cluster.local"
      port: 8125
  tracing:
    provider: "datadog"
    datadog:
      host: "datadog-agent.acme-infrastructure.svc.cluster.local"
      port: 8126
```

## Implementation

### Provider Interface

```typescript
interface IMetricsProvider {
  createCounter(name: string, description?: string): ICounter;
  createHistogram(name: string, description?: string, unit?: string): IHistogram;
  createGauge(name: string, description?: string): IGauge;
}

interface ICounter {
  add(value: number, labels?: Record<string, string>): void;
}

interface IHistogram {
  record(value: number, labels?: Record<string, string>): void;
}

interface IGauge {
  set(value: number, labels?: Record<string, string>): void;
}
```

### Console Metrics Provider (Local Development)

```typescript
class ConsoleMetricsProvider implements IMetricsProvider {
  private config: ConsoleConfig;
  
  constructor(config: ConsoleConfig) {
    this.config = config;
  }
  
  createCounter(name: string, description?: string): ICounter {
    return new ConsoleCounter(name, description, this.config);
  }
  
  createHistogram(name: string, description?: string, unit?: string): IHistogram {
    return new ConsoleHistogram(name, description, unit, this.config);
  }
}

class ConsoleCounter implements ICounter {
  constructor(
    private name: string, 
    private description?: string,
    private config?: ConsoleConfig
  ) {}
  
  add(value: number, labels?: Record<string, string>): void {
    const timestamp = new Date().toISOString();
    const labelsStr = labels ? ` ${JSON.stringify(labels)}` : '';
    
    if (this.config?.format === 'json') {
      console.log(JSON.stringify({
        type: 'counter',
        name: this.name,
        value,
        labels,
        timestamp
      }));
    } else {
      console.log(`📊 [${timestamp}] COUNTER ${this.name}: +${value}${labelsStr}`);
    }
  }
}

class ConsoleHistogram implements IHistogram {
  constructor(
    private name: string,
    private description?: string, 
    private unit?: string,
    private config?: ConsoleConfig
  ) {}
  
  record(value: number, labels?: Record<string, string>): void {
    const timestamp = new Date().toISOString();
    const labelsStr = labels ? ` ${JSON.stringify(labels)}` : '';
    const unitStr = this.unit ? ` ${this.unit}` : '';
    
    if (this.config?.format === 'json') {
      console.log(JSON.stringify({
        type: 'histogram',
        name: this.name,
        value,
        unit: this.unit,
        labels,
        timestamp
      }));
    } else {
      console.log(`📈 [${timestamp}] HISTOGRAM ${this.name}: ${value}${unitStr}${labelsStr}`);
    }
  }
}
```

### File Metrics Provider (Testing/Debugging)

```typescript
class FileMetricsProvider implements IMetricsProvider {
  private config: FileConfig;
  
  constructor(config: FileConfig) {
    this.config = config;
  }
  
  createCounter(name: string, description?: string): ICounter {
    return new FileCounter(name, description, this.config);
  }
  
  // Similar implementation that writes to file instead of console
}
```

### Datadog Metrics Provider (Production)

```typescript
class DatadogMetricsProvider implements IMetricsProvider {
  private client: StatsD;
  
  constructor(config: DatadogConfig) {
    this.client = new StatsD({
      host: config.host,
      port: config.port,
      prefix: 'acme.pipeline.'
    });
  }
  
  createCounter(name: string, description?: string): ICounter {
    return new DatadogCounter(name, this.client);
  }
  
  createHistogram(name: string, description?: string, unit?: string): IHistogram {
    return new DatadogHistogram(name, this.client);
  }
}
```

### Factory Pattern

```typescript
class ObservabilityFactory {
  private static metricsProvider: IMetricsProvider;
  private static tracingProvider: ITracingProvider;
  
  static getMetricsProvider(): IMetricsProvider {
    if (!this.metricsProvider) {
      const config = ConfigProvider.get('observability.metrics');
      this.metricsProvider = this.createMetricsProvider(config);
    }
    return this.metricsProvider;
  }
  
  private static createMetricsProvider(config: MetricsConfig): IMetricsProvider {
    switch (config.provider) {
      case 'datadog':
        return new DatadogMetricsProvider(config.datadog!);
      case 'console':
        return new ConsoleMetricsProvider(config.console!);
      case 'file':
        return new FileMetricsProvider(config.file!);
      default:
        return new NoopMetricsProvider();
    }
  }
  
  static getTracingProvider(): ITracingProvider {
    if (!this.tracingProvider) {
      const config = ConfigProvider.get('observability.tracing');
      this.tracingProvider = this.createTracingProvider(config);
    }
    return this.tracingProvider;
  }
}
```

## Usage Examples

### Local Development Output

```bash
📊 [2025-09-06T13:52:40.123Z] COUNTER webhook.processContact.count: +1 {"outcome":"success","contactId":"hubspot-123"}
📈 [2025-09-06T13:52:40.145Z] HISTOGRAM webhook.processContact.duration: 22 ms {"outcome":"success","contactId":"hubspot-123"}
📊 [2025-09-06T13:52:40.146Z] COUNTER mysql.query.count: +1 {"operation":"insertContact","table":"contacts"}
📈 [2025-09-06T13:52:40.147Z] HISTOGRAM mysql.query.duration: 5 ms {"operation":"insertContact","table":"contacts"}
```

### Production Datadog Integration

```typescript
// Automatically sends to Datadog agent via StatsD protocol
// Metrics appear in Datadog dashboard with proper tags and aggregation
```

## Benefits

1. **Environment Flexibility**: Same code works in local, K8s, and production
2. **Development Visibility**: See metrics immediately during local development
3. **Simple Configuration**: Single ConfigMap controls all observability behavior
4. **Zero Code Changes**: Developers don't need to know about observability configuration
5. **Testing Support**: File output enables metric validation in tests

## Integration with Pipeline Testing

The interactive pipeline testing can use console or file output to validate:
- Circuit breaker metrics during failure scenarios
- Database operation timing and success rates
- Business outcome distributions (noop/wait/forward)
- Trace correlation across pipeline stages

This provides the "dogfooding" validation you want - seeing the same metrics in testing that production will generate.
