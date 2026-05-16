# Developer Guide - HubSpot Webhook Processing Pipeline

This guide explains how to work with the HubSpot webhook processing pipeline monorepo, including the contact-level distributed tracing system.

## 🏗️ Architecture Overview

### Contact-Level Distributed Tracing Flow
```
HubSpot Webhook → Simple Publisher → SQS → Webhook Subscriber → SQS → Intent Subscriber
                      ↓                        ↓                        ↓
                 contactTraceId           contactTraceId           contactTraceId
                 (span created)          (span continued)         (span continued)
```

### Core Services

1. **Simple Publisher** (`services/simple-publisher/`)
   - Receives HubSpot webhook events
   - Generates unique `contactTraceId` per contact
   - Creates contact-level tracing spans
   - Sends messages to SQS queues

2. **Webhook Subscriber** (`services/webhook-subscriber/`)
   - Processes SQS messages from Simple Publisher
   - Validates and transforms webhook events
   - Continues contact-level tracing using `contactTraceId`
   - Sends processed events to Intent Subscriber

3. **Intent Subscriber** (`services/intent-subscriber/`)
   - Extracts intents from processed webhook events
   - Completes contact-level tracing spans
   - Records processing outcomes (success/noop/failed)

### Shared Packages

- **`@platform/configuration`** - Type-safe configuration management
- **`@platform/infrastructure`** - Observability factory and health checks
- **`@platform/core`** - Shared utilities and logging
- **`@platform/services`** - AWS service clients (SQS, S3, etc.)
- **`@crm/hubspot`** - HubSpot-specific business logic

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- pnpm (package manager)
- Docker Desktop
- kubectl
- Kind (for local Kubernetes)

### Initial Setup
```bash
# Clone and install dependencies
git clone <repo-url>
cd k8s-no-observable
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Local Development

#### 1. Start Infrastructure
```bash
# Create Kind cluster
kind create cluster --name hubspot-pipeline

# Deploy infrastructure
kubectl apply -k infrastructure/k8s/overlays/local/

# Wait for services to be ready
kubectl get pods -w
```

#### 2. Port Forward Services
```bash
# LocalStack (AWS services)
kubectl port-forward -n data-pipeline svc/localstack 4566:4566 &

# PostgreSQL
kubectl port-forward -n data-pipeline svc/postgres 5432:5432 &

# Health check endpoints
kubectl port-forward -n data-pipeline svc/simple-publisher 30001:3001 &
kubectl port-forward -n data-pipeline svc/webhook-subscriber 30002:3001 &
kubectl port-forward -n data-pipeline svc/intent-subscriber 30003:3001 &
```

#### 3. Test Services
```bash
# Check health endpoints
curl http://localhost:30001/health/readiness  # Simple Publisher
curl http://localhost:30002/health/readiness  # Webhook Subscriber  
curl http://localhost:30003/health/readiness  # Intent Subscriber

# View configuration (with secrets masked)
curl http://localhost:30001/config
```

## 🔧 Development Workflow

### Making Changes

1. **Modify Code**: Edit files in `services/` or `packages/`
2. **Build**: `pnpm build` (or `pnpm build --filter=@service/simple-publisher`)
3. **Test**: `pnpm test`
4. **Deploy**: `kubectl apply -k infrastructure/k8s/overlays/local/`

### Adding New Services

1. Create service directory: `services/my-new-service/`
2. Add `package.json` with workspace dependencies
3. Create Kubernetes manifests in `infrastructure/k8s/base/my-new-service/`
4. Add to Kustomize overlays
5. Update this documentation

### Working with Observability

#### Configuration
Observability is configured via environment variables:

```bash
# Development (default)
OBSERVABILITY_PROVIDER=console
OBSERVABILITY_TRACING_ENABLED=true
OBSERVABILITY_METRICS_ENABLED=true

# Production with Datadog
OBSERVABILITY_PROVIDER=datadog
OBSERVABILITY_TRACING_ENABLED=true
OBSERVABILITY_METRICS_ENABLED=true
```

#### Adding Tracing to New Code
```typescript
import { ObservabilityFactory } from '@platform/infrastructure';

// Get tracer
const tracer = ObservabilityFactory.getTracingProvider();

// Create span
const span = tracer.startSpan('my-service.processContact');
span.setAttributes({
    'business.contact_trace_id': contactTraceId,
    'business.portal_id': portalId,
    'operation.name': 'processContact'
});

try {
    // Your business logic here
    span.setStatus({ code: SpanStatus.OK });
    span.setAttributes({ 'result.outcome': 'success' });
} catch (error) {
    span.setStatus({ code: SpanStatus.ERROR, message: error.message });
    span.setAttributes({ 'result.outcome': 'failed' });
} finally {
    span.end();
}
```

## 📊 Monitoring & Debugging

### Health Checks
Each service exposes health endpoints on port 3001:
- `/health/liveness` - Basic service health
- `/health/readiness` - Service + dependencies health
- `/health/startup` - Initialization status
- `/config` - Configuration dump (secrets masked)

### Logs
```bash
# View service logs
kubectl logs -f deployment/simple-publisher -n data-pipeline
kubectl logs -f deployment/webhook-subscriber -n data-pipeline
kubectl logs -f deployment/intent-subscriber -n data-pipeline

# Follow all logs
kubectl logs -f -l app.kubernetes.io/part-of=hubspot-pipeline -n data-pipeline
```

### Tracing
With console provider, traces appear in service logs:
```
[TRACE] Started span: simple-publisher.processContact
[TRACE] ✅ Finished span: simple-publisher.processContact (45ms) [SUCCESS] {contact_trace_id: "01HF3Z...", portal_id: 20564323}
```

## 🏗️ Project Structure

```
k8s-no-observable/
├── services/                           # Microservices
│   ├── simple-publisher/              # HubSpot webhook receiver
│   ├── webhook-subscriber/            # SQS message processor
│   └── intent-subscriber/             # Intent extraction service
├── packages/                          # Shared libraries
│   ├── configuration/                 # Type-safe config management
│   ├── infrastructure/                # Observability & health checks
│   ├── core/                         # Shared utilities
│   ├── services/                     # AWS service clients
│   └── framework/                    # Batch processing framework
├── integrations/                      # Business logic integrations
│   └── hubspot/                      # HubSpot-specific logic
├── infrastructure/                    # Kubernetes manifests
│   └── k8s/                         # Kustomize configurations
├── docs/                             # Additional documentation
└── tools/                           # Development tools & scripts
```

## 🔒 Configuration Management

### Type-Safe Configuration
All configuration uses type-safe constants:

```typescript
import { ConfigProvider, CONFIG } from '@platform/configuration';

// ✅ Type-safe - compile-time validation
const provider = ConfigProvider.get(CONFIG.OBSERVABILITY_PROVIDER);

// ❌ Avoid - runtime errors possible
const provider = ConfigProvider.getRaw('observability.provider');
```

### Environment Variables
Key environment variables for development:

```bash
# Observability
OBSERVABILITY_PROVIDER=console|datadog|opentelemetry
OBSERVABILITY_TRACING_ENABLED=true|false
OBSERVABILITY_METRICS_ENABLED=true|false

# Health Checks (R&D troubleshooting)
HEALTH_CHECK_MAX_RETRIES=3              # 0 = infinite retries
HEALTH_CHECK_RETRY_INTERVAL_SECONDS=30
HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED=false

# AWS/LocalStack
AWS_REGION=us-east-1
LOCALSTACK_ENDPOINT=http://localstack:4566
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm test --filter=@platform/infrastructure

# Watch mode
pnpm test --watch
```

### Integration Tests
```bash
# Test with local infrastructure
kubectl apply -k infrastructure/k8s/overlays/local/
pnpm test:integration
```

### End-to-End Testing
```bash
# Send test webhook
curl -X POST http://localhost:30001/webhook \
  -H "Content-Type: application/json" \
  -d '{"portalId": 12345, "subscriptionType": "contact.propertyChange", "events": [...]}'

# Check processing in logs
kubectl logs -f deployment/simple-publisher -n data-pipeline
kubectl logs -f deployment/webhook-subscriber -n data-pipeline  
kubectl logs -f deployment/intent-subscriber -n data-pipeline
```

## 🚀 Deployment

### Local Development
```bash
kubectl apply -k infrastructure/k8s/overlays/local/
```

### Development Environment
```bash
kubectl apply -k infrastructure/k8s/overlays/dev/
```

### Production Deployment
See [EKS_DEPLOYMENT.md](./EKS_DEPLOYMENT.md) for production deployment guide.

## 🤝 Contributing

1. **Create Feature Branch**: `git checkout -b feature/my-feature`
2. **Make Changes**: Follow the development workflow above
3. **Add Tests**: Ensure new code has appropriate test coverage
4. **Update Documentation**: Update this guide if adding new features
5. **Test Locally**: Verify changes work in local Kind cluster
6. **Create Pull Request**: Include description of changes and testing performed

## 📚 Additional Resources

- [Contact-Level Tracing Architecture](./docs/architecture/contact-tracing.md)
- [Observability Configuration](./docs/observability/configuration.md)
- [Kubernetes Infrastructure](./infrastructure/k8s/README.md)
- [Troubleshooting Guide](./docs/troubleshooting.md)

## 🆘 Common Issues

### Build Failures
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Port Conflicts
```bash
# Kill existing port forwards
pkill -f "kubectl port-forward"
# Restart port forwarding commands
```

### Configuration Issues
```bash
# Check configuration endpoint
curl http://localhost:30001/config

# Verify environment variables
kubectl exec deployment/simple-publisher -n data-pipeline -- env | grep OBSERVABILITY
```

### Health Check Failures
```bash
# Check health endpoints
curl http://localhost:30001/health/readiness

# View detailed health status
kubectl describe pod <pod-name> -n data-pipeline
```
