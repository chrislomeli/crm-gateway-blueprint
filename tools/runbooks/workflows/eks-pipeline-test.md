---
description: Interactive end-to-end pipeline testing (Publish → Fulfill → Intent) with automated validation
---

# Interactive End-to-End Pipeline Testing

## 🎯 Why This Runbook Exists

**The Problem We're Solving:**
You have a complex 3-stage HubSpot webhook processing pipeline that needs thorough validation before your development team integrates with it. Manual testing is tedious and error-prone, but you need confidence that the entire flow works correctly.

**What This Runbook Does:**
This is an **interactive validation guide** designed to be executed with an AI assistant (like Cascade) who can run commands, validate outputs, and troubleshoot issues in real-time. It's not a script - it's a **guided conversation** that walks through your pipeline systematically.

**The Value:**
- **Catch integration issues early** before developers encounter them
- **Build confidence** in your pipeline architecture  
- **Enable rapid iteration** when making changes
- **Document the expected behavior** for future reference

## Pipeline Overview

**A. Publish Stage** 
- **Tool**: `tools/testing/local-simple-publisher.ts single`
- **Input**: HubSpot webhook events (simulated)
- **Output**: Re-formatted and grouped events → `aio-webhook-single` SQS queue (AWS)

**B. Fulfill Stage**
- **Tool**: `services/webhook-subscriber/src/test-webhook-handler.ts`
- **Transport**: SQS `aio-webhook-single` queue
- **Input**: Grouped HubSpot webhook events
- **Output**: 
  - OpenSearch `contact-***` index updated
  - Selected events → `aio-intent-queue` SQS queue

**C. Intent Stage**
- **Tool**: `services/intent-subscriber/` (needs runner investigation)
- **Transport**: SQS `aio-intent-queue` queue  
- **Input**: Selected grouped HubSpot events
- **Output**:
  - New row in `calls-db.intent` table
  - API call to decision URL (200/400/500 responses)

## 🤔 What You're Actually Doing Here

**This Is Not A Script** - It's a **guided validation conversation**. You're systematically walking through your pipeline to:

1. **Verify each stage works** - Publish → Fulfill → Intent
2. **Observe queue state changes** - Watch messages flow through SQS queues
3. **Validate data transformations** - Ensure data flows correctly from webhooks → OpenSearch → Database
4. **Build operational confidence** - Know your pipeline works before developers depend on it

**Why Interactive Mode Works Better:**
- **Real-time problem solving** - When something breaks, troubleshoot immediately
- **Context awareness** - AI remembers what happened in previous steps
- **Adaptive testing** - Try different scenarios based on what you discover
- **Learning opportunity** - Understand your pipeline behavior deeply

## Usage Modes

**🤖 Interactive Mode (Recommended):**
- Start a conversation: "Let's run the interactive pipeline test"
- AI executes commands, validates outputs, and troubleshoots issues
- Perfect for learning, debugging, and building confidence

**📋 Manual Mode:**
- Copy/paste commands independently
- Use when you want to run specific steps or scenarios

## Environment Setup

**🏗️ Two-Cluster Architecture:**
- **acme-local**: Uses containers (LocalStack, MySQL) to avoid hitting real AWS resources
- **acme-dev**: Minimal Docker setup, uses **real AWS resources** and requires VPN for database access

**This runbook is designed for `acme-dev` environment testing against real AWS resources.**

## Prerequisites

**Required Setup:**
- ✅ AWS credentials configured and connected to the right account
- ✅ VPN connection active (required for database access)
- ✅ Config maps pulled locally: `tools/scripts/setup.configs.sh`
- ✅ Services built and available (webhook-subscriber, intent-subscriber)

## Create ECR repositories
```bash
# once only
aws ecr create-repository --repository-name simple-publisher --region us-west-2
aws ecr create-repository --repository-name webhook-subscriber  --region us-west-2
aws ecr create-repository --repository-name intent-subscriber  --region us-west-2


```


## Update your account details in infrastructure/eks/k8s/overlays/sandbox/kustomization.yaml
```
- aws_account_id=282418939575
- aws_region=us-west-2
- app_iam_role_arn=arn:aws:iam::282418939575:role/dev-1-282418939575-kubernetes-worker-role
```

```bash
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 282418939575.dkr.ecr.us-west-2.amazonaws.com
```


```bash
DOCKER_PLATFORM=linux/amd64  REGISTRY=282418939575.dkr.ecr.us-west-2.amazonaws.com PUSH=true TAG=v5 tsx build/build-services.ts

# or this version
DOCKER_PLATFORM=linux/amd64 tsx build/build-services.ts

DOCKER_PLATFORM=linux/amd64  REGISTRY=282418939575.dkr.ecr.us-west-2.amazonaws.com PUSH=true TAG=v5 tsx build/build-services.ts

```

```javascript

```

## 🏥 Health Endpoint Testing

### 🎯 Why Health Testing Matters

**The Problem We're Solving:**
After deploying services to Kubernetes, you need to validate that all health endpoints are working correctly. Health endpoints are critical for:
- **Kubernetes probes** - liveness, readiness, and startup probes
- **Load balancer health checks** - ensuring traffic routes to healthy pods
- **Operational monitoring** - detecting service degradation before it impacts users
- **Troubleshooting** - diagnosing issues when services aren't behaving correctly

**What This Section Does:**
Provides a systematic approach to test all health endpoints across your deployed services, ensuring they return proper HTTP status codes and can handle the expected probe traffic.

### 📋 Health Endpoint Overview

Each service exposes health endpoints on **port 3001**:

- **`/health/live`** - Liveness probe (basic service health)
- **`/health/ready`** - Readiness probe (ready to serve traffic) 
- **`/health/startup`** - Startup probe (service initialization complete)
- **`/health`** - General health check
- **`/metrics`** - Prometheus-style metrics
- **`/config`** - Configuration dump (with sensitive data masked)

### 🔍 Step-by-Step Health Testing Process

#### Step 1: Check Pod Status

First, verify all pods are running and ready:

```bash
kubectl get pods -n clomeli
```

**Expected Output:**
```
NAME                                             READY   STATUS    RESTARTS   AGE
aio-hubspot-signal-service-7d55bd774d-s42wq      1/1     Running   0          5m
crm-hubspot-webhook-ingress-65c7d6cc9b-bqvhc     1/1     Running   0          5m
crm-hubspot-webhook-processor-747cf4bc67-g7tgn   1/1     Running   0          5m
```

**What We're Looking For:**
- ✅ All pods show `1/1 Ready`
- ✅ Status is `Running`
- ✅ Restart count is `0` (or low and stable)

#### Step 2: Check Service Endpoints

Get service information to understand access methods:

```bash
kubectl get services -n clomeli
```

**Expected Output:**
```
NAME                            TYPE           EXTERNAL-IP                     PORT(S)
aio-hubspot-signal-service      ClusterIP      172.20.21.180                  80/TCP,3001/TCP
crm-hubspot-webhook-ingress     LoadBalancer   a44...elb.amazonaws.com        80:31161/TCP,3001:32409/TCP
crm-hubspot-webhook-processor   ClusterIP      172.20.212.186                 80/TCP,3001/TCP
```

**What We're Looking For:**
- ✅ Services expose port `3001` for health checks
- ✅ LoadBalancer services have external endpoints
- ✅ ClusterIP services are accessible via port-forwarding

#### Step 3: Test LoadBalancer Service (Direct Access)

For services with LoadBalancer type (like `crm-hubspot-webhook-ingress`):

```bash
# Test liveness endpoint
curl -s -o /dev/null -w "%{http_code}" http://EXTERNAL-IP:3001/health/live

# Test readiness endpoint  
curl -s -o /dev/null -w "%{http_code}" http://EXTERNAL-IP:3001/health/ready

# Test startup endpoint
curl -s -o /dev/null -w "%{http_code}" http://EXTERNAL-IP:3001/health/startup
```

**Expected Results:**
- ✅ All endpoints return `200`
- ✅ No connection timeouts or errors

#### Step 4: Test ClusterIP Services (Port-Forward Access)

For ClusterIP services, use port-forwarding to access health endpoints:

**Test crm-hubspot-webhook-processor:**
```bash
# Start port-forward (runs in background)
kubectl port-forward -n clomeli service/crm-hubspot-webhook-processor 3002:3001 &

# Wait for port-forward to establish
sleep 2

# Test all health endpoints
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health/live
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health/ready
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health/startup

# Clean up port-forward
pkill -f "kubectl port-forward.*crm-hubspot-webhook-processor"
```

**Test aio-hubspot-signal-service:**
```bash
# Start port-forward (runs in background)
kubectl port-forward -n clomeli service/aio-hubspot-signal-service 3003:3001 &

# Wait for port-forward to establish
sleep 2

# Test all health endpoints
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health/live
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health/ready
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health/startup

# Clean up port-forward
pkill -f "kubectl port-forward.*aio-hubspot-signal-service"
```

**Expected Results:**
- ✅ All endpoints return `200`
- ✅ Port-forward establishes successfully
- ✅ No connection refused errors

### 🎉 Success Criteria

**All Tests Pass When:**

| Service | /health/live | /health/ready | /health/startup |
|---------|-------------|---------------|-----------------|
| crm-hubspot-webhook-ingress | ✅ 200 | ✅ 200 | ✅ 200 |
| crm-hubspot-webhook-processor | ✅ 200 | ✅ 200 | ✅ 200 |
| aio-hubspot-signal-service | ✅ 200 | ✅ 200 | ✅ 200 |

### 🚨 Common Issues and Troubleshooting

#### Issue: Health Endpoints Return 404

**Symptoms:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://service:3001/health/live
# Returns: 404
```

**Possible Causes:**
- Health server not started properly
- Wrong endpoint path (try `/health` instead of `/health/live`)
- Service not exposing port 3001

**Troubleshooting Steps:**
```bash
# Check pod logs for health server startup
kubectl logs -n clomeli deployment/SERVICE-NAME

# Check if port 3001 is exposed
kubectl describe service -n clomeli SERVICE-NAME

# Try alternative health endpoint paths
curl -s -o /dev/null -w "%{http_code}" http://service:3001/health
```

#### Issue: ES Module Import Errors

**Symptoms:**
```bash
curl http://service:3001/health/live
# Returns: Error [ERR_REQUIRE_ESM]: require() of ES module not supported
```

**Root Cause:**
Mixed `require()` and `import` statements in ES module codebase.

**Solution:**
1. Find all `require()` statements in source code:
   ```bash
   grep -r "require(" packages/*/src --include="*.ts"
   ```

2. Replace with proper ES module imports:
   ```typescript
   // Bad: require() in ES module
   const { ConfigProvider } = require('@platform/configuration');
   
   // Good: ES module import
   import { ConfigProvider } from '@platform/configuration';
   ```

3. Rebuild and redeploy Docker images

#### Issue: Port-Forward Connection Refused

**Symptoms:**
```bash
curl http://localhost:3002/health/live
# Returns: curl: (7) Failed to connect to localhost port 3002: Connection refused
```

**Troubleshooting Steps:**
```bash
# Check if port-forward is running
ps aux | grep "kubectl port-forward"

# Check if service exists
kubectl get service -n clomeli SERVICE-NAME

# Try different local port
kubectl port-forward -n clomeli service/SERVICE-NAME 3004:3001
```

### 📝 Health Testing Checklist

Use this checklist to systematically validate all health endpoints:

**Pre-Testing:**
- [ ] All pods show `1/1 Ready` status
- [ ] All pods have `0` restarts (or stable low count)
- [ ] Services expose port `3001`

**LoadBalancer Services:**
- [ ] External IP accessible
- [ ] `/health/live` returns 200
- [ ] `/health/ready` returns 200  
- [ ] `/health/startup` returns 200

**ClusterIP Services:**
- [ ] Port-forward establishes successfully
- [ ] `/health/live` returns 200
- [ ] `/health/ready` returns 200
- [ ] `/health/startup` returns 200
- [ ] Port-forward cleaned up after testing

**Post-Testing:**
- [ ] No zombie port-forward processes running
- [ ] All services remain stable after testing
- [ ] Health endpoints respond consistently

### 🎯 Integration with CI/CD

**For Automated Testing:**
This health testing approach can be integrated into CI/CD pipelines:

```bash
# Example automated health check script
#!/bin/bash
NAMESPACE="your-namespace"
SERVICES=("service1" "service2" "service3")
HEALTH_ENDPOINTS=("/health/live" "/health/ready" "/health/startup")

for service in "${SERVICES[@]}"; do
  for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
    kubectl port-forward -n $NAMESPACE service/$service 3001:3001 &
    PF_PID=$!
    sleep 2
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001$endpoint)
    
    if [ "$HTTP_CODE" -eq 200 ]; then
      echo "✅ $service$endpoint - 200 OK"
    else
      echo "❌ $service$endpoint - $HTTP_CODE FAILED"
      exit 1
    fi
    
    kill $PF_PID
    sleep 1
  done
done
```

This systematic approach ensures your Kubernetes deployments are healthy and ready to serve traffic reliably.