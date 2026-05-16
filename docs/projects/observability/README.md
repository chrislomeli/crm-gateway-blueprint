# Observability Strategy for HubSpot Pipeline

## Overview

This document outlines the comprehensive observability strategy for the HubSpot webhook processing pipeline, designed to provide production-grade visibility, resilience, and debugging capabilities while maintaining a seamless developer experience.

## Architecture Philosophy

**Hybrid Approach**: Combine bottom-up infrastructure wrapping with top-down business logic observability to achieve both technical resilience and business visibility.

**Developer Experience**: Transparent facade pattern - developers use existing APIs and get observability for free, without changing how they write code.

## Trace Hierarchy Design

### 3-Level Tracing Architecture

```
parentTraceId (Webhook Array Level - Lineage Only)
├── contactSpan1 (Contact Level - Primary Business Context) 
│   ├── eventSpan1.1 (Individual Event)
│   ├── eventSpan1.2 (Individual Event)
│   └── eventSpan1.3 (Individual Event)
├── contactSpan2 (Contact Level)
│   ├── eventSpan2.1 (Individual Event)
│   └── eventSpan2.2 (Individual Event)
```

### Trace Context Flow

- **Publisher**: Creates `parentTraceId`, groups events by contact → creates `contactSpan` per contact
- **Webhook-Subscriber**: Inherits `contactSpan`, creates `eventSpan` per event during processing
- **Intent-Subscriber**: Inherits `eventSpan` for intent processing decisions

### Contact-Level Span ULID

Each contact gets a unique ULID-based span identifier that flows through the entire pipeline:
- Generated during initial contact grouping in publisher
- Propagated through SQS message metadata
- Used as primary business context for all operations

## Implementation Strategy

### Foundation Tasks (Required)

#### 1. Observability Configuration System
**Goal**: Simple ConfigMap-driven observability that works in all environments

```typescript
// ConfigMap Configuration
interface ObservabilityConfig {
  metrics: {
    provider: 'datadog' | 'console' | 'file';
    datadogAgent?: {
      host: string;           // 'datadog-agent.acme-infrastructure.svc.cluster.local'
      port: number;           // 8125
    };
    console?: {
      enabled: boolean;       // true for local development
      format: 'json' | 'pretty';
    };
    file?: {
      enabled: boolean;
      path: string;           // '/tmp/metrics.log'
    };
  };
  tracing: {
    provider: 'datadog' | 'console' | 'noop';
    datadogAgent?: {
      host: string;
      port: number;           // 8126
    };
  };
}
```

**Environment-Specific Behavior**:
- **K8s Production**: Points to Datadog daemonset via service DNS
- **Local Development**: Console logging or file output for visibility
- **Testing**: Fake wrapper that captures metrics for validation

**Implementation**:
```typescript
class ObservabilityFactory {
  static getMetricsProvider(): IMetricsProvider {
    const config = ConfigProvider.get('observability.metrics');
    
    switch (config.provider) {
      case 'datadog':
        return new DatadogMetricsProvider(config.datadogAgent);
      case 'console':
        return new ConsoleMetricsProvider(config.console);
      case 'file':
        return new FileMetricsProvider(config.file);
      default:
        return new NoopMetricsProvider();
    }
  }
}
```

#### 2. Database Facade Wrapping
**Goal**: Transparent observability for all database operations

```typescript
// Developer Experience (unchanged)
const result = await MySQLService.CRM.query('SELECT * FROM contacts WHERE id = ?', [contactId]);

// Behind the scenes: Automatically wrapped with observability
class MySQLService {
  static get CRM() {
    return this._wrappedCRMInstance ||= this._wrapDatabaseService(
      this._baseCRMInstance,
      'mysql-crm'
    );
  }
}
```

**Targets**:
- `MySQLService.CRM` and `MySQLService.acme`
- `ElasticsearchFacade` operations
- Automatic circuit breaker, retry, and metrics

#### 2. Result Pattern Standardization
**Goal**: Consistent error handling and business outcome differentiation

```typescript
interface BusinessResult<T> extends Result<T> {
  outcome?: 'success' | 'noop' | 'wait' | 'partial' | 'failure';
  metadata?: {
    recordsProcessed?: number;
    recordsSkipped?: number;
    reasonCode?: string;
  };
}
```

**Benefits**:
- Circuit breakers distinguish business logic from technical failures
- Metrics separate business outcomes from infrastructure issues
- Alerting uses appropriate severity levels

#### 3. Contact-Level Span ULID Generation
**Goal**: Unique identifier system for contact-level trace context

```typescript
interface ContactSpanContext {
  parentTraceId: string;     // "webhook-batch-12345" (lineage)
  contactSpanId: string;     // "contact-01HKQM7X8P9R2S3T4V5W6Y7Z8A" (ULID)
  contactId: string;         // "hubspot-contact-abc" (business ID)
  createdAt: string;         // ISO timestamp
}
```

**Implementation**:
- Generate ULID during contact grouping in publisher
- Store in contact processing context
- Propagate through all operations

### Optional Enhancements

#### 4. SQS Message Metadata Enhancement
**Goal**: Rich trace context propagation through message queues

```typescript
interface EnhancedSQSMessage {
  messageBody: ContactProcessingData;
  messageAttributes: {
    parentTraceId: string;
    contactSpanId: string;
    contactId: string;
    sourceService: string;
    processingStage: string;
    eventCount: number;
  };
}
```

#### 5. HTTP Client Facade
**Goal**: Wrapped Axios facade for automatic HTTP observability

```typescript
// Replace: import axios from 'axios'
// With: import { httpClient } from '@platform/infrastructure'

const response = await httpClient.post('/api/decision', payload);
// Automatic: circuit breaker, retry, metrics, tracing
```

## Wrapping Strategy

### Bottom-Up Infrastructure Wrapping

**High Value Targets**:
- ✅ `MySQLService.query()` → Database resilience + metrics
- ✅ `ElasticsearchFacade.indexContact()` → Search operation visibility  
- ✅ HTTP client calls → External API circuit breakers
- ❓ SQS operations → Optional (focus on message-level failures)

### Top-Down Business Logic Wrapping

**Contact-Span Business Operations**:

```typescript
// Webhook-Service: Wrap entire contact processing
const processContact = createObservableFunction({
  operationName: 'webhook.processContact',
  // contactSpan becomes active context
}, async () => {
  // Business outcome metrics:
  return success({
    outcome: 'contact_updated' | 'contact_failed',
    eventsProcessed: number,
    intentsGenerated: number
  });
});

// Intent-Service: Wrap entire intent evaluation  
const evaluateContactIntents = createObservableFunction({
  operationName: 'intent.evaluateContact',
  // Inherits contactSpan from SQS metadata
}, async () => {
  // Business outcome metrics:
  return success({
    outcome: 'noop' | 'wait' | 'forward' | 'failed',
    intentRecordsCreated: number,
    decisionServiceCalled: boolean
  });
});
```

## Business Metrics Strategy

### Webhook-Service Metrics
- `contact.processing.outcome` → {updated, failed}
- `contact.events.processed.count` → Number per contact
- `contact.intents.generated.count` → Intent detection rate

### Intent-Service Metrics  
- `intent.evaluation.outcome` → {noop, wait, forward, failed}
- `intent.records.created.count` → Database write success
- `decision.service.called` → External integration rate

### Infrastructure Metrics
- Database query duration, error rates, connection pool stats
- HTTP response times, status codes, retry counts  
- Circuit breaker state changes, rate limiting events

## Pipeline Lifecycle Observability

### Stage 1: Publisher
**Focus**: Batch processing efficiency
- Wrap: Event grouping logic, SQS batch publishing
- Metrics: Events per batch, grouping efficiency, publish latency
- Tracing: parentTraceId creation, contact grouping spans

### Stage 2: Webhook-Subscriber
**Focus**: Contact processing and intent filtering  
- Wrap: Contact update logic, intent evaluation, queue publishing
- Metrics: Contact processing time, intent detection rate, filtering accuracy
- Tracing: contactSpan inheritance, eventSpan creation per event

### Stage 3: Intent-Subscriber
**Focus**: Intent processing outcomes and decision service integration
- Wrap: Intent criteria evaluation, database writes, decision service calls
- Metrics: Intent outcome distribution (NOOP/WAIT/FORWARD), decision service latency
- Tracing: eventSpan inheritance, decision service call spans

## Implementation Phases

### Phase 1: Foundation (Immediate)
1. ✅ Database facade wrapping (`MySQLService`, `ElasticsearchFacade`)
2. ✅ Result pattern standardization with business outcomes
3. ✅ Contact-level span ULID generation system

### Phase 2: Integration (Next)
1. ✅ SQS metadata enhancement (optional)
2. ✅ HTTP client facade creation
3. ✅ Business logic wrapper implementation

### Phase 3: Validation (Future)
1. ✅ Interactive pipeline testing with observability
2. ✅ Validate circuit breakers and resilience patterns work
3. ✅ Confirm trace propagation through entire pipeline

## Developer Experience Goals

### What Developers See
- Same APIs they're used to
- Automatic resilience and observability  
- Rich error context when things fail
- Business outcome visibility in logs/metrics

### What They Don't See
- Complex observability configuration
- Manual trace context management
- Circuit breaker implementation details
- Retry logic complexity

## Validation Integration

The observability strategy directly enhances the interactive pipeline testing by:

1. **Automatic Test Observability**: Wrap pipeline validation functions with same observability stack
2. **Real-Time Health Monitoring**: Each test stage gets automatic health signals and metrics
3. **Enhanced Troubleshooting**: Distributed traces connect all pipeline stages with rich context
4. **Confidence Building**: Validate that circuit breakers, rate limiting, and resilience patterns actually work

This creates a "dogfooding" approach where the validation tools use the same observability infrastructure that production services will use, building confidence in both the pipeline and the observability system itself.
