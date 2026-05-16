#!/bin/bash

# Deploy the complete LocalStack Secrets Manager + External Secrets Operator system
# This demonstrates the REAL production pattern using LocalStack for local development

set -e

echo "🚀 Deploying LocalStack Secrets Manager + External Secrets Operator system..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Create namespace if it doesn't exist
echo "📦 Creating namespace..."
kubectl create namespace data-pipeline --dry-run=client -o yaml | kubectl apply -f -

# Step 1: Deploy LocalStack with Secrets Manager
echo "🔧 Deploying LocalStack with Secrets Manager..."
kubectl apply -f k8s/localstack/

# Wait for LocalStack to be ready
echo "⏳ Waiting for LocalStack to be ready..."
kubectl wait --for=condition=available --timeout=120s deployment/localstack -n data-pipeline

# Step 2: Install External Secrets Operator
echo "🔐 Installing External Secrets Operator..."
if ! helm repo list | grep -q external-secrets; then
    helm repo add external-secrets https://charts.external-secrets.io
fi
helm repo update

if ! helm list -n external-secrets-system | grep -q external-secrets; then
    helm install external-secrets external-secrets/external-secrets \
        -n external-secrets-system \
        --create-namespace \
        --wait
fi

echo "✅ External Secrets Operator installed!"

# Step 3: Populate LocalStack Secrets Manager
echo "🔑 Populating LocalStack Secrets Manager..."
kubectl apply -f k8s/localstack/secrets-bootstrap-job.yaml

# Wait for secrets bootstrap to complete
echo "⏳ Waiting for LocalStack secrets bootstrap to complete..."
kubectl wait --for=condition=complete --timeout=120s job/localstack-secrets-bootstrap -n data-pipeline

# Check job status
if kubectl get job localstack-secrets-bootstrap -n data-pipeline -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' | grep -q "True"; then
    echo "✅ LocalStack Secrets Manager populated successfully!"
else
    echo "❌ LocalStack secrets bootstrap failed!"
    kubectl logs job/localstack-secrets-bootstrap -n data-pipeline
    exit 1
fi

# Step 4: Deploy External Secrets configuration
echo "🔗 Deploying External Secrets configuration for LocalStack..."
kubectl apply -f k8s/config/external-secrets/localstack-secret-store.yaml

# Wait for External Secrets to sync
echo "⏳ Waiting for External Secrets to sync from LocalStack..."
sleep 10

# Step 5: Deploy configuration system
echo "📄 Deploying configuration system..."
kubectl apply -f k8s/config/configmaps.yaml

echo "✅ ConfigMaps created directly!"

# Step 6: Deploy updated pipeline-worker
echo "🔄 Deploying pipeline-worker with LocalStack Secrets Manager integration..."
kubectl apply -f k8s/pipeline-worker/deployment.yaml

# Wait for pipeline-worker to be ready
echo "⏳ Waiting for pipeline-worker to be ready..."
kubectl rollout status deployment/pipeline-worker -n data-pipeline --timeout=180s

# Step 7: Verify the complete system
echo "🔍 Verifying LocalStack Secrets Manager + External Secrets system..."
echo ""

echo "📊 External Secrets status:"
kubectl get externalsecrets -n data-pipeline

echo ""
echo "🔐 Kubernetes Secrets (synced from LocalStack):"
kubectl get secrets -n data-pipeline | grep -E "(shared-secrets|pipeline-worker-secrets|hello-world-secrets)"

echo ""
echo "📋 ConfigMaps:"
kubectl get configmaps -n data-pipeline | grep -E "(shared-config|pipeline-worker-config|hello-world-config)"

echo ""
echo "🚀 Pipeline Worker pods:"
kubectl get pods -n data-pipeline -l app=pipeline-worker

echo ""
echo "✅ LocalStack Secrets Manager + External Secrets Operator system deployed successfully!"
echo ""
echo "🎯 What we've demonstrated:"
echo "   • LocalStack Secrets Manager for local development"
echo "   • External Secrets Operator syncing secrets"
echo "   • Same patterns as production AWS"
echo "   • Zero code changes needed for EKS migration"
echo "   • ConfigProvider works identically"
echo ""
echo "📝 To view pipeline-worker logs and see configuration loading:"
echo "   kubectl logs -f deployment/pipeline-worker -n data-pipeline"
echo ""
echo "🔍 To verify secrets are synced from LocalStack:"
echo "   kubectl get externalsecrets -n data-pipeline -o wide"
echo ""
echo "🧹 To clean up:"
echo "   kubectl delete namespace data-pipeline"
echo "   helm uninstall external-secrets -n external-secrets-system"
