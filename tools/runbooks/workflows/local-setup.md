---
description: Complete local development environment setup using TypeScript infrastructure tools
---

# Local Development Environment Setup

This workflow guides you through setting up a complete local development environment using our TypeScript infrastructure tools. It creates a Kind cluster with LocalStack for AWS services, MySQL database, and deploys the NestJS simple-publisher service for end-to-end testing.

## Usage

This runbook can be used in two ways:

**🤖 Interactive Mode (Recommended):**
- Use with Cascade AI assistant for guided step-by-step execution
- Cascade will prompt you for each step and validate results
- Great for learning or when troubleshooting is needed

**📋 Manual Mode:**
- Execute steps independently by copy/pasting commands
- Each step includes validation commands to verify success
- Troubleshooting section available for common issues

## Prerequisites

Before starting, ensure you have:
- **Docker Desktop** running
- **kubectl** configured
- **kind** installed (`brew install kind`)
- **Node.js 18+** and **pnpm** installed
- **tsx** installed globally (`npm install -g tsx`)
- Optional: **mysql** client for database verification

### 🔑 Critical Setup Requirements

**Workspace Dependencies:** The InfrastructureManager.ts requires workspace packages to be built:
```bash
# MUST run this first - builds @platform/services, @platform/core, @platform/configuration
pnpm build --filter='!./services/*'
```

**Kind Cluster Configuration:** Must use the specific cluster config that maps NodePorts:
- File: `infrastructure/kind/kind-cluster-config.yaml`
- Maps LocalStack NodePort 30568 to host port 30568
- Maps MySQL NodePort 30306 to host port 30306

**Infrastructure Deployment:** Must deploy base infrastructure before running InfrastructureManager:
```bash
kubectl apply -f infrastructure/k8s/base/infrastructure/
```

**Environment Variable:** InfrastructureManager.ts MUST use correct LocalStack endpoint:
```bash
AWS_ENDPOINT_URL=http://localhost:30568
```

### What This Setup Provides
- **Kind cluster** with LocalStack (SQS + Secrets Manager)
- **MySQL database** with test data
- **NestJS simple-publisher** service ready for testing
- **Complete infrastructure** managed by TypeScript tools

---
## Quick Reset

To quickly reset the entire environment:
```bash
# Delete everything and start fresh
kind delete cluster --name acme-local
rm -rf ./config/
# Then run this workflow again from Step 1
```

## Step 1: Environment Cleanup and Preparation

First, let's ensure we have a clean environment for a repeatable setup:

```bash
# Check for existing clusters
echo "🔍 Checking for existing Kind clusters..."
kind get clusters

# Clean up any existing cluster
if kind get clusters | grep -q "kind"; then
    echo "🧹 Cleaning up existing cluster..."
    kind delete cluster
    echo "✅ Cluster deleted"
else
    echo "✅ No existing cluster found"
fi

# Clean up local config files
echo "🧹 Cleaning up local config files..."
rm -rf ./config/
echo "✅ Local configs cleaned"
```

**Validation:** Should show cluster deletion (if existed) and config cleanup completion.

## Step 2: Build Core Packages

Build the core packages that services depend on:

```bash
# Build all packages except services
pnpm build --filter='!./services/*'
```

**Validation:** Build should complete without errors.

## Step 3: Create Kind Cluster and Deploy Infrastructure

Create the Kind cluster and deploy the infrastructure components:

```bash

# Create the Kind cluster
cd ../..

kind create cluster --config infrastructure/kind/kind-cluster-config.yaml

# Deploy infrastructure components (LocalStack, MySQL)
kubectl apply -f infrastructure/k8s/base/infrastructure/

# Wait for infrastructure to be ready
echo "⏳ Waiting for infrastructure pods to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=localstack --timeout=300s
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=mysql --timeout=300s
```

**Validation:** Check that infrastructure pods are running
```bash
kubectl get pods
```

Expected: LocalStack and MySQL pods should be in `Running` status within 2-3 minutes.

## Step 4: Initialize Infrastructure Using TypeScript Tools

Now we use our TypeScript `InfrastructureManager` to set up LocalStack services and MySQL database.

**🔑 CRITICAL:** The InfrastructureManager requires the correct LocalStack endpoint to work with our Kind cluster:

```bash
# Run our comprehensive TypeScript infrastructure setup with correct endpoint
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts setup
```

**Why this works:**
- LocalStack runs in K8s with NodePort 30568 (maps to internal port 4566)
- `@platform/services` use `AWS_ENDPOINT_URL` environment variable for LocalStack connectivity
- Same service abstractions used by simple-publisher ensure consistency
- Environment-aware approach works both locally and in K8s

This single command will:
- ✅ **LocalStack Setup**: Create 3 SQS queues (hubspot-webhook-single-queue, hubspot-webhook-import-queue, hubspot-intent-queue)
- ✅ **Secrets Manager**: Create 6 configuration secrets for all services
- ✅ **Database Setup**: Initialize MySQL with schema and test data (47 business records)
- ✅ **Connectivity Verification**: Test all services are accessible

**Validation:** You should see output like:
```
🎉 Infrastructure Setup Complete!
==================================
📊 Summary:
   ✅ LocalStack: SQS + Secrets Manager ready
   ✅ SQS Queues: 3 queues created
   ✅ Secrets: 6 created/verified
   ✅ MySQL: Database and tables ready
   ✅ Connectivity: All services verified
🚀 Ready for K8s validation!
```

**Health Check:** You can verify infrastructure health anytime:
```bash
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts health
```

## Step 5: Build and Deploy NestJS Services

Now let's build and deploy our NestJS simple-publisher service:

```bash
# Build the simple-publisher service
pnpm build --filter=simple-publisher

# Deploy the service to Kubernetes
kubectl apply -f infrastructure/k8s/base/simple-publisher/

# Wait for the service to be ready
echo "⏳ Waiting for simple-publisher to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=simple-publisher --timeout=300s
```

**Validation:** Check that the service pod is running:
```bash
kubectl get pods -l app.kubernetes.io/name=simple-publisher
```

## Step 6: Verify Complete Setup

Final validation that everything is working together:

```bash
# Check all pods are running
kubectl get pods

# Test LocalStack connectivity
curl -s http://localhost:30566/_localstack/health | jq '.services'

# Test database connectivity
mysql -h 127.0.0.1 -P 30306 -u acme_user -pacme_password calls -e "SELECT COUNT(*) as business_count FROM businessDetails WHERE intentFieldName IS NOT NULL;"

# Test simple-publisher health endpoints
kubectl port-forward svc/simple-publisher 3000:3000 &
sleep 2
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/ready | jq .
pkill -f "kubectl port-forward"
```

**Expected Results:**
- ✅ All pods running (LocalStack, MySQL, simple-publisher)
- ✅ LocalStack shows SQS and Secrets Manager available
- ✅ Database query returns count of business records
- ✅ Health endpoints return success responses

## Step 7: Test End-to-End Webhook Processing

Test the complete webhook flow with our NestJS service:

```bash
# Port-forward to access the service
kubectl port-forward svc/simple-publisher 3000:3000 &

# Test webhook endpoint with sample HubSpot event
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '[{
    "eventId": 1,
    "subscriptionId": 123,
    "portalId": 456,
    "appId": 789,
    "occurredAt": 1234567890123,
    "subscriptionType": "contact.propertyChange",
    "attemptNumber": 0,
    "objectId": 101112,
    "changeSource": "CRM_UI",
    "propertyName": "email",
    "propertyValue": "test@example.com"
  }]'

# Clean up port-forward
pkill -f "kubectl port-forward"
```

**Expected Result:** Should return `200 OK` with webhook processing confirmation.

## Troubleshooting

### Cluster Issues
If pods are not starting:
```bash
# Check cluster status
kubectl cluster-info
kind get clusters

# Check pod status and logs
kubectl get pods
kubectl describe pod <pod-name>
kubectl logs <pod-name>

# Restart cluster if needed
kind delete cluster
# Then restart from Step 1
```

### Infrastructure Setup Issues
If the TypeScript infrastructure setup fails:

**Missing AWS_ENDPOINT_URL:**
```bash
# WRONG - will fail to connect to LocalStack
tsx tools/infrastructure/InfrastructureManager.ts setup

# CORRECT - includes required environment variable
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts setup
```

**Workspace Dependencies Not Built:**
```bash
# Error: Cannot find module '@platform/services'
# Solution: Build workspace packages first
pnpm build --filter='!./services/*'
```

**LocalStack Not Accessible:**
```bash
# Test LocalStack connectivity
curl -s http://localhost:30568/_localstack/health

# If fails, check NodePort mapping
kubectl get svc localstack
# Should show: 4566:30568/TCP

# Check pod status
kubectl get pods -l app.kubernetes.io/name=localstack
kubectl logs -l app.kubernetes.io/name=localstack
```

**General Infrastructure Debugging:**
```bash
# Run health check to see what's failing
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts health

# Check individual components
kubectl logs -l app.kubernetes.io/name=localstack
kubectl logs -l app.kubernetes.io/name=mysql

# Restart failed pods
kubectl delete pod -l app.kubernetes.io/name=localstack
kubectl delete pod -l app.kubernetes.io/name=mysql
```

### Service Deployment Issues
If simple-publisher service fails:
```bash
# Check service logs
kubectl logs -l app.kubernetes.io/name=simple-publisher

# Check service configuration
kubectl describe deployment simple-publisher

# Rebuild and redeploy
pnpm build --filter=simple-publisher
kubectl delete -f infrastructure/k8s/base/simple-publisher/
kubectl apply -f infrastructure/k8s/base/simple-publisher/
```

### LocalStack Connection Issues
If LocalStack services aren't accessible:
```bash
# Check LocalStack health
curl -s http://localhost:30566/_localstack/health

# Port-forward if needed
kubectl port-forward svc/localstack 4566:4566 &

# Test with port-forward
curl -s http://localhost:4566/_localstack/health
```

## Next Steps

Once setup is complete, you can:
- **Develop locally**: Services use ConfigProvider with K8s-mounted configs
- **Test webhook processing**: Use the `/webhook/test` endpoint for development
- **Monitor services**: Use `kubectl logs` to watch service behavior
- **Iterate quickly**: Rebuild and redeploy individual services as needed

## 🎯 The Key Breakthrough: One Command Infrastructure Setup

**The Magic Command:**
```bash
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts setup
```

**Why This Works (Technical Details):**
1. **LocalStack NodePort**: K8s exposes LocalStack on NodePort 30568 (maps to internal 4566)
2. **Service Abstractions**: `@platform/services` use `AWS_ENDPOINT_URL` environment variable
3. **Unified Codebase**: Same services used by simple-publisher ensure consistency
4. **Environment Aware**: Works locally (NodePort) and in K8s (service DNS)
5. **Idempotent Operations**: Safe to run multiple times, creates or verifies resources

**What Gets Created:**
- **3 SQS Queues**: hubspot-webhook-single-queue, hubspot-webhook-import-queue, hubspot-intent-queue
- **6 Secrets**: postgres, mysql, shared-infrastructure, pipeline-worker-credentials, elasticsearch-credentials, hello-world-credentials
- **MySQL Schema**: businessDetails, intent, userCRM, businessusers tables with 47 test records
- **Full Validation**: Connectivity tests for all services

## Summary

This setup provides:
- ✅ **Complete local K8s environment** with Kind
- ✅ **TypeScript-managed infrastructure** (eliminates bash script chaos!)
- ✅ **LocalStack for AWS services** (SQS + Secrets Manager)
- ✅ **MySQL database** with test data
- ✅ **NestJS simple-publisher** ready for development
- ✅ **End-to-end webhook testing** capability
- ✅ **Production-like configuration** using ConfigProvider

**Key Benefits:**
- **Maintainable**: All infrastructure logic in TypeScript
- **Repeatable**: Complete teardown and setup automation
- **Educational**: Clear steps for learning K8s deployment patterns
- **Production-ready**: Same patterns used in production deployments
- **Self-contained**: No port forwarding or manual setup required
