# K8s Hello World - Runbooks

Clean, organized operational procedures for managing the k8s-hello-world system.

## 🎯 Reorganized Structure

We've consolidated from **19 scattered scripts** to **11 focused runbooks** organized into:
- **7 Utilities** - Reusable building blocks
- **4 Workflows** - End-to-end procedures

## 🔧 Utilities (Building Blocks)

| Utility | Purpose | Used By |
|---------|---------|---------|
| `wait-for-localstack.sh` | Wait for LocalStack to be ready | All workflows |
| `check-pods.sh` | Verify all pods are running and healthy | Infrastructure workflows |
| `test-database-connectivity.sh` | Test MySQL/PostgreSQL connections | Infrastructure validation |
| `test-localstack-connectivity.sh` | Test LocalStack/AWS services | Infrastructure validation |
| `check-sqs-queues.sh` | Verify SQS queue health and status | Batch processing workflows |
| `validate-configmaps.sh` | Validate ConfigMaps contain !ssm patterns | Configuration workflows |
| `audit-secret-config.sh` | Audit secret management configuration | Configuration workflows |

## 🎭 Workflows (End-to-End Procedures)

| Workflow | Purpose | When to Use |
|----------|---------|-------------|
| `validate-infrastructure.sh` | **⭐ Complete infrastructure validation** | After deployments, daily health checks |
| `bootstrap-secrets.sh` | **⭐ Complete two-tier secret management demo** | Initial setup, understanding secret flow |
| `trigger-dispatcher.sh` | Manually trigger batch dispatcher | Testing batch processing pipeline |
| `test-batch-pipeline.sh` | End-to-end batch processing validation | Pipeline testing and troubleshooting |

## 🚀 Quick Start (New Users)

```bash
# 1. Verify infrastructure is working
./runbooks/workflows/validate-infrastructure.sh

# 2. Bootstrap secrets for applications  
./runbooks/workflows/bootstrap-secrets.sh

# 3. Test the batch processing pipeline
./runbooks/workflows/test-batch-pipeline.sh
```

## 🎯 Key Benefits

- ✅ **Utilities are reusable** - Called by multiple workflows
- ✅ **Workflows orchestrate** - End-to-end procedures using utilities
- ✅ **No script bloat** - Consolidated from 19 → 11 runbooks
- ✅ **Clear separation** - Building blocks vs complete procedures
- ✅ **Easy to discuss** - "Run the infrastructure validation workflow"

## 📖 Usage Notes

- **Workflows** are what you typically run (end-to-end procedures)
- **Utilities** are called by workflows (but can be run standalone)
- All runbooks are executable shell scripts
- Run from project root directory
- Check runbook comments for prerequisites
