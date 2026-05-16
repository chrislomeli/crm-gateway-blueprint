# Batch Processing Patterns

## Overview

This document captures the key patterns established for batch processing services in the k8s-hello-world project. These patterns are designed to be Helm/Terraform-ready and production-scalable.

## Architecture Decisions

### CronJob vs Deployment
**Decision**: Use CronJob for batch-dispatcher
**Rationale**: 
- Batch processing is naturally scheduled work
- Kubernetes provides enterprise-grade scheduling "for free"
- No resource consumption between runs
- Built-in failure tracking and history

### Configuration Layering
**Pattern**: 3-layer configuration architecture
```
1. Shared Infrastructure (k8s/shared/) - SQS queues, S3 buckets, database endpoints
2. Environment Config (k8s/local/) - Environment-specific settings, AWS endpoints
3. App-Specific Config (k8s/local/) - Service-specific settings, timeouts, limits
```

**Benefits**:
- Clear separation of concerns
- Easy environment switching
- Helm-template ready
- Reusable infrastructure configs

## Testing Strategies

### CronJob Testing
```bash
# Deploy suspended CronJob
kubectl apply -f batch-dispatcher-deployment.yaml

# Test immediately (don't wait for schedule)
kubectl create job --from=cronjob/batch-dispatcher test-run-$(date +%s)

# Check logs
kubectl logs job/test-run-1234567890

# Enable scheduling when ready
kubectl patch cronjob batch-dispatcher -p '{"spec":{"suspend":false}}'
```

### Database Initialization
```bash
# Initialize MySQL
./scripts/init-database-local.sh mysql

# Initialize PostgreSQL  
./scripts/init-database-local.sh postgres

# Switch databases anytime
./scripts/init-database-local.sh postgres clean
./scripts/init-database-local.sh mysql
```

## Service Patterns

### Modern Batch-Loader Service Template
```typescript
// Modern entrypoint pattern
async function main() {
    console.log('Initializing [Service Name]...');
    
    try {
        // Initialize configuration (works locally and in containers)
        await ConfigProvider.initialize();
        console.log('Configuration initialized');
        
        // Run the service logic
        await runService();
    } catch (error) {
        console.error('Failed to start service:', error);
        process.exit(1);
    }
}
```

**Key Characteristics**:
- Single entrypoint (e.g., `dispatcher.app.ts`)
- Modern config loading (`ConfigProvider.initialize()`)
- Local/container compatible (no environment-specific logic)
- Clean dependencies (only what's actually used)
- No legacy code

## Production Stack Progression

```
Phase 1: Raw K8s YAML (Current)
├── Local development and testing
├── Pattern establishment
└── Proof of concept

Phase 2: Helm Charts (Next)
├── Templating and parameterization
├── Environment-specific values
└── Package management

Phase 3: Terraform + Helm (Production)
├── Infrastructure as Code
├── Automated provisioning
└── GitOps workflow

Phase 4: GitHub Actions (CI/CD)
├── Automated deployments
├── Testing pipelines
└── Release management
```

## Configuration Examples

### Infrastructure Config (Shared)
```yaml
# k8s.md/shared/infrastructure-config.yaml
data:
  sqs.batch-processing-queue: "batch-processing-dev"
  s3.batch-files-bucket: "acme-batch-files-dev"
  mysql.host: "mysql.default.svc.cluster.local"
```

### Environment Config
```yaml
# k8s.md/local/environment-config.yaml  
data:
  environment: "local"
  aws.endpoint-override: "http://localstack:4566"
  database.primary: "mysql"  # or "postgres"
```

### App-Specific Config
```yaml
# k8s.md/local/batch-dispatcher-config.yaml
data:
  batch.max-concurrent-tenants: "10"
  dispatcher.scan-interval: "60"
  crm.hubspot.task-definition: "batch-importer-hubspot"
```

## Next Steps

- [ ] Apply this pattern to remaining batch-loader services
- [ ] Convert to Helm charts with values.yaml
- [ ] Add Terraform modules for infrastructure
- [ ] Implement GitHub Actions for CI/CD
