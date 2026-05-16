# Batch Processing Architecture

## Overview

This directory contains documentation for the batch processing system architecture, patterns, and implementation details. The batch processing system is designed for modern Kubernetes deployment with Helm/Terraform readiness.

## Architecture Components

### Core Services
- **batch-dispatcher** - Orchestrates batch import jobs for CRM tenants
- **batch-importers** - Processes specific CRM data imports  
- **file-discovery** - Discovers and queues files for processing
- **file-processors** - Processes discovered files

### Infrastructure
- **Database** - MySQL/PostgreSQL with flexible switching
- **Message Queues** - SQS for job dispatch and coordination
- **Object Storage** - S3 for file storage and processing
- **Configuration** - 3-layer ConfigMap architecture

## Documentation Structure

```
docs/batch-processing/
├── README.md                    # This overview
├── architecture.md              # System architecture and design decisions
├── configuration.md             # Configuration patterns and examples
├── deployment.md                # Kubernetes deployment patterns
├── testing.md                   # Testing strategies and examples
└── migration-guide.md           # Migration from legacy docker-compose
```

## Quick Start

### Local Development Setup
```bash
# Initialize database (MySQL or PostgreSQL)
./scripts/init-database-local.sh mysql

# Deploy batch-dispatcher
kubectl apply -f k8s.md/shared/infrastructure-config.yaml
kubectl apply -f k8s.md/local/environment-config.yaml  
kubectl apply -f k8s.md/local/batch-dispatcher-config.yaml
kubectl apply -f k8s.md/local/batch-dispatcher-deployment.yaml

# Test immediately (don't wait for schedule)
kubectl create job --from=cronjob/batch-dispatcher test-run-$(date +%s)
```

### Production Deployment Path
```
Phase 1: Raw K8s YAML → Phase 2: Helm Charts → Phase 3: Terraform + Helm → Phase 4: GitHub Actions
```

## Key Design Principles

1. **Kubernetes Native** - Leverage K8s scheduling, health checks, and resource management
2. **Configuration Layering** - Shared infrastructure, environment-specific, and app-specific configs
3. **Testing Friendly** - Instant testing without waiting for schedules
4. **Helm Ready** - All patterns designed for easy Helm chart conversion
5. **Database Flexible** - Support both MySQL and PostgreSQL with easy switching

## Getting Help

- See individual documentation files for detailed information
- Check `docs/standards/` for general project standards
- Review working examples in `k8s/local/` directory
