# EKS Deployment Guide - HubSpot Webhook Processing Pipeline

This guide covers deploying the HubSpot webhook processing pipeline with contact-level distributed tracing to Amazon EKS for sandbox testing and production use.

## 🎯 Deployment Overview

### Architecture in EKS
```
Internet → ALB → EKS Cluster → Services
                     ↓
              [simple-publisher]
                     ↓
                 SQS Queues
                     ↓
              [webhook-subscriber]
                     ↓
                 SQS Queues  
                     ↓
              [intent-subscriber]
```

### Observability in EKS
- **Development/Sandbox**: Console provider with CloudWatch logs
- **Production**: Datadog provider with APM integration
- **Contact Tracing**: End-to-end spans correlated by `contactTraceId`

## 🏗️ Prerequisites

### AWS Resources Required
- **EKS Cluster** (1.28+)
- **ECR Repository** for container images
- **SQS Queues** for message processing
- **RDS Instance** (PostgreSQL) for configuration
- **Secrets Manager** for sensitive configuration
- **CloudWatch** for logging and monitoring

### Local Tools
- `aws-cli` configured with appropriate permissions
- `kubectl` configured for your EKS cluster
- `docker` for building images
- `pnpm` for building the application

## 🚀 Step-by-Step Deployment

### Step 1: Build and Push Container Images

```bash
# Build all services
pnpm build

# Build Docker images
docker build -t simple-publisher:latest -f services/simple-publisher/Dockerfile .
docker build -t webhook-subscriber:latest -f services/webhook-subscriber/Dockerfile .
docker build -t intent-subscriber:latest -f services/intent-subscriber/Dockerfile .

# Tag for ECR (replace with your account ID and region)
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker tag simple-publisher:latest ${ECR_REGISTRY}/simple-publisher:latest
docker tag webhook-subscriber:latest ${ECR_REGISTRY}/webhook-subscriber:latest
docker tag intent-subscriber:latest ${ECR_REGISTRY}/intent-subscriber:latest

# Login to ECR and push
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
docker push ${ECR_REGISTRY}/simple-publisher:latest
docker push ${ECR_REGISTRY}/webhook-subscriber:latest
docker push ${ECR_REGISTRY}/intent-subscriber:latest
```

### Step 2: Create Namespace and Secrets

```bash
# Create namespace for sandbox testing
kubectl create namespace hubspot-pipeline-sandbox

# Create secrets for configuration
kubectl create secret generic hubspot-config \
  --from-literal=HUBSPOT_API_KEY=your-api-key \
  --from-literal=DATABASE_PASSWORD=your-db-password \
  --namespace=hubspot-pipeline-sandbox

# Create observability configuration
kubectl create configmap observability-config \
  --from-literal=OBSERVABILITY_PROVIDER=console \
  --from-literal=OBSERVABILITY_TRACING_ENABLED=true \
  --from-literal=OBSERVABILITY_METRICS_ENABLED=true \
  --namespace=hubspot-pipeline-sandbox
```

### Step 3: Configure Environment-Specific Overlays

Create EKS-specific Kustomize overlay:

```bash
mkdir -p infrastructure/k8s/overlays/eks-sandbox
```

Create `infrastructure/k8s/overlays/eks-sandbox/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: hubspot-pipeline-sandbox

resources:
  - ../../base/simple-publisher
  - ../../base/webhook-subscriber
  - ../../base/intent-subscriber
  - ../../base/shared-config

images:
  - name: simple-publisher
    newName: 123456789012.dkr.ecr.us-east-1.amazonaws.com/simple-publisher
    newTag: latest
  - name: webhook-subscriber
    newName: 123456789012.dkr.ecr.us-east-1.amazonaws.com/webhook-subscriber
    newTag: latest
  - name: intent-subscriber
    newName: 123456789012.dkr.ecr.us-east-1.amazonaws.com/intent-subscriber
    newTag: latest

patchesStrategicMerge:
  - environment-config.yaml

configMapGenerator:
  - name: environment-config
    literals:
      - AWS_REGION=us-east-1
      - OBSERVABILITY_PROVIDER=console
      - OBSERVABILITY_TRACING_ENABLED=true
      - OBSERVABILITY_METRICS_ENABLED=true
      - LOG_LEVEL=info
```

Create `infrastructure/k8s/overlays/eks-sandbox/environment-config.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: simple-publisher
spec:
  template:
    spec:
      containers:
      - name: simple-publisher
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: OBSERVABILITY_PROVIDER
          valueFrom:
            configMapKeyRef:
              name: observability-config
              key: OBSERVABILITY_PROVIDER
        - name: OBSERVABILITY_TRACING_ENABLED
          valueFrom:
            configMapKeyRef:
              name: observability-config
              key: OBSERVABILITY_TRACING_ENABLED
        - name: HUBSPOT_API_KEY
          valueFrom:
            secretKeyRef:
              name: hubspot-config
              key: HUBSPOT_API_KEY
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhook-subscriber
spec:
  template:
    spec:
      containers:
      - name: webhook-subscriber
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: OBSERVABILITY_PROVIDER
          valueFrom:
            configMapKeyRef:
              name: observability-config
              key: OBSERVABILITY_PROVIDER
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: intent-subscriber
spec:
  template:
    spec:
      containers:
      - name: intent-subscriber
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: OBSERVABILITY_PROVIDER
          valueFrom:
            configMapKeyRef:
              name: observability-config
              key: OBSERVABILITY_PROVIDER
```

### Step 4: Deploy to EKS

```bash
# Deploy the application
kubectl apply -k infrastructure/k8s/overlays/eks-sandbox/

# Verify deployment
kubectl get pods -n hubspot-pipeline-sandbox
kubectl get services -n hubspot-pipeline-sandbox

# Check health endpoints
kubectl port-forward -n hubspot-pipeline-sandbox svc/simple-publisher 8080:3001 &
curl http://localhost:8080/health/readiness
```

## 🔧 Configuration Management

### Environment Variables for EKS

#### Required Environment Variables
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# Observability Configuration
OBSERVABILITY_PROVIDER=console|datadog
OBSERVABILITY_TRACING_ENABLED=true
OBSERVABILITY_METRICS_ENABLED=true

# Application Configuration
LOG_LEVEL=info
HEALTH_CHECK_MAX_RETRIES=3
```

#### Secrets Management
Store sensitive data in Kubernetes secrets or AWS Secrets Manager:

```bash
# Using Kubernetes secrets
kubectl create secret generic app-secrets \
  --from-literal=HUBSPOT_API_KEY=your-key \
  --from-literal=DATABASE_PASSWORD=your-password \
  --namespace=hubspot-pipeline-sandbox

# Using AWS Secrets Manager (recommended for production)
aws secretsmanager create-secret \
  --name hubspot-pipeline/config \
  --secret-string '{"HUBSPOT_API_KEY":"your-key","DATABASE_PASSWORD":"your-password"}'
```

### Observability Configuration by Environment

#### Sandbox/Development
```yaml
configMapGenerator:
  - name: observability-config
    literals:
      - OBSERVABILITY_PROVIDER=console
      - OBSERVABILITY_TRACING_ENABLED=true
      - OBSERVABILITY_METRICS_ENABLED=true
      - LOG_LEVEL=debug
```

#### Production
```yaml
configMapGenerator:
  - name: observability-config
    literals:
      - OBSERVABILITY_PROVIDER=datadog
      - OBSERVABILITY_TRACING_ENABLED=true
      - OBSERVABILITY_METRICS_ENABLED=true
      - LOG_LEVEL=info
      - DD_SERVICE=hubspot-pipeline
      - DD_ENV=production
```

## 📊 Monitoring & Observability

### CloudWatch Integration
With console provider, traces and logs go to CloudWatch:

```bash
# View logs
aws logs describe-log-groups --log-group-name-prefix /aws/eks/hubspot-pipeline

# Stream logs
aws logs tail /aws/eks/hubspot-pipeline-sandbox/simple-publisher --follow
```

### Datadog Integration (Production)
For production deployments with Datadog:

1. **Install Datadog Agent**:
```bash
helm repo add datadog https://helm.datadoghq.com
helm install datadog datadog/datadog \
  --set datadog.apiKey=<YOUR_API_KEY> \
  --set datadog.appKey=<YOUR_APP_KEY> \
  --set datadog.site=datadoghq.com
```

2. **Configure Services**:
```yaml
env:
  - name: OBSERVABILITY_PROVIDER
    value: "datadog"
  - name: DD_SERVICE
    value: "simple-publisher"
  - name: DD_ENV
    value: "production"
  - name: DD_VERSION
    value: "1.0.0"
```

### Contact-Level Tracing Queries

#### CloudWatch Insights
```sql
fields @timestamp, @message
| filter @message like /contact_trace_id/
| filter @message like /01HF3Z.../
| sort @timestamp desc
```

#### Datadog APM
- Filter by `business.contact_trace_id:01HF3Z...`
- View service map with contact flow
- Analyze performance by contact processing time

## 🚨 Troubleshooting

### Common Issues

#### 1. Image Pull Errors
```bash
# Check ECR permissions
aws ecr describe-repositories --repository-names simple-publisher

# Verify image exists
aws ecr describe-images --repository-name simple-publisher
```

#### 2. Configuration Issues
```bash
# Check configmaps and secrets
kubectl get configmaps -n hubspot-pipeline-sandbox
kubectl get secrets -n hubspot-pipeline-sandbox

# View configuration endpoint
kubectl port-forward -n hubspot-pipeline-sandbox svc/simple-publisher 8080:3001
curl http://localhost:8080/config
```

#### 3. Health Check Failures
```bash
# Check pod status
kubectl describe pod <pod-name> -n hubspot-pipeline-sandbox

# View health endpoints
kubectl port-forward -n hubspot-pipeline-sandbox svc/simple-publisher 8080:3001
curl http://localhost:8080/health/readiness
```

#### 4. Networking Issues
```bash
# Check services and endpoints
kubectl get svc -n hubspot-pipeline-sandbox
kubectl get endpoints -n hubspot-pipeline-sandbox

# Test internal connectivity
kubectl exec -it <pod-name> -n hubspot-pipeline-sandbox -- curl http://webhook-subscriber:3001/health/liveness
```

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy to EKS Sandbox

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Build and push images
      run: |
        pnpm build
        docker build -t simple-publisher .
        # ... build and push steps
    
    - name: Deploy to EKS
      run: |
        aws eks update-kubeconfig --name my-cluster
        kubectl apply -k infrastructure/k8s/overlays/eks-sandbox/
```

## 🎯 Production Considerations

### Scaling
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: simple-publisher
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: simple-publisher
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Security
- Use AWS IAM roles for service accounts (IRSA)
- Enable network policies
- Use AWS Secrets Manager for sensitive data
- Enable pod security standards

### High Availability
- Deploy across multiple AZs
- Use horizontal pod autoscaling
- Configure appropriate resource requests/limits
- Set up proper health checks and readiness probes

## 📚 Next Steps

1. **Test End-to-End**: Send test webhooks and verify contact tracing
2. **Monitor Performance**: Set up alerts for health check failures
3. **Scale Testing**: Increase load to test autoscaling
4. **Production Migration**: Follow production deployment checklist
5. **Observability Enhancement**: Integrate with your preferred APM solution

For additional support, see the [Developer Guide](./DEVELOPER_GUIDE.md) and [Troubleshooting Documentation](./docs/troubleshooting.md).
