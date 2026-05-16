# Scripts Organization

This directory contains all operational scripts organized by purpose.

## Directory Structure

### `infrastructure/` - Cluster Setup & Infrastructure
- **`local-up.sh`** - Complete local Kind cluster setup (from runbooks/utilities)
- **`wait-for-localstack.sh`** - Wait for LocalStack readiness (from runbooks/utilities)
- **`deploy-localstack-secrets.sh`** - Deploy LocalStack secrets bootstrap
- **`setup-localstack-secrets.sh`** - Setup LocalStack secrets
- **`localstack-secrets-bootstrap.yaml`** - LocalStack secrets bootstrap job
- **`dump-localstack-secrets-job.yaml`** - LocalStack secrets dump job

### `config/` - Configuration Management
- **`render-pod-configs.sh`** - Render exact pod filesystem structure for local development

### `validation/` - Health Checks & Verification
- **`check-pods.sh`** - Check pod status and health (from runbooks/utilities)
- **`check-sqs-queues.sh`** - Validate SQS queues (from runbooks/utilities)
- **`validate-configmaps.sh`** - Validate ConfigMap contents (from runbooks/utilities)
- **`audit-secret-config.sh`** - Audit secret configurations (from runbooks/utilities)
- **`check-required-images.sh`** - Check required Docker images (from runbooks/utilities)

### `testing/` - End-to-End Testing
- **`test-database-connectivity.sh`** - Test database connections (from runbooks/utilities)
- **`test-localstack-connectivity.sh`** - Test LocalStack connectivity (from runbooks/utilities)
- **`trigger-dispatcher.sh`** - Trigger batch dispatcher for testing (from runbooks/utilities)

### `deprecated/` - Legacy Scripts (May Not Work)
- **`apply-configs.sh`** - Old config application script
- **`deploy-file-generator.sh`** - Old file generator deployment
- **`deploy-local.sh`** - Old local deployment script
- **`init-database-local.sh`** - Old database initialization
- **`init-mysql-local.sh`** - Old MySQL initialization
- **`init-postgres-local.sh`** - Old PostgreSQL initialization
- **`send-test-messages.sh`** - Old test message sender

## Usage

### Quick Start Local Environment
```bash
# Setup complete local environment
./scripts/infrastructure/local-up.sh

# Render pod configs for local development
./scripts/config/render-pod-configs.sh local

# Validate everything is working
./scripts/validation/check-pods.sh
./scripts/validation/check-sqs-queues.sh
```

### Testing & Validation
```bash
# Test database connectivity
./scripts/testing/test-database-connectivity.sh

# Test LocalStack services
./scripts/testing/test-localstack-connectivity.sh

# Trigger batch processing test
./scripts/testing/trigger-dispatcher.sh
```

## Migration Notes

- **Working scripts** moved from `runbooks/utilities/` to appropriate categories
- **Potentially broken scripts** moved to `deprecated/` for review
- **New scripts** like `render-pod-configs.sh` placed in appropriate categories
- **Runbooks** should now reference scripts in their new locations

## Next Steps

1. **Test deprecated scripts** - Determine which can be fixed vs removed
2. **Update runbook references** - Point to new script locations
3. **Add new scripts** to appropriate categories as needed
4. **Document script dependencies** and requirements
