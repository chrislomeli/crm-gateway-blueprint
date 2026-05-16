#!/bin/bash

# Setup LocalStack Secrets for Local Development
# This script deploys the LocalStack secrets bootstrap job and waits for completion

set -e

echo "🚀 Setting up LocalStack secrets for local development..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Create namespace if it doesn't exist
echo "📦 Creating namespace..."
kubectl create namespace data-pipeline --dry-run=client -o yaml | kubectl apply -f -

# Apply the bootstrap job
echo "🔑 Deploying LocalStack secrets bootstrap job..."
kubectl apply -f scripts/localstack-secrets-bootstrap.yaml

# Wait for job completion
echo "⏳ Waiting for secrets bootstrap to complete..."
kubectl wait --for=condition=complete --timeout=120s job/localstack-secrets-bootstrap -n data-pipeline

# Check job status
if kubectl get job localstack-secrets-bootstrap -n data-pipeline -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' | grep -q "True"; then
    echo "✅ LocalStack secrets bootstrap completed successfully!"
    echo ""
    echo "🎯 Your LocalStack now contains the following secrets:"
    echo "   • postgres-database (PostgreSQL credentials)"
    echo "   • mysql-database (MySQL credentials)"  
    echo "   • shared-infrastructure (AWS/LocalStack config)"
    echo "   • pipeline-worker-credentials (Worker config)"
    echo "   • elasticsearch-credentials (Search config)"
    echo "   • hello-world-credentials (App secrets)"
    echo ""
    echo "🧪 You can now run configuration tests with:"
    echo "   cd packages/configuration && npm test"
    echo ""
    echo "🔧 To view bootstrap logs:"
    echo "   kubectl logs job/localstack-secrets-bootstrap -n data-pipeline"
else
    echo "❌ LocalStack secrets bootstrap failed!"
    echo "📋 Checking job logs..."
    kubectl logs job/localstack-secrets-bootstrap -n data-pipeline
    exit 1
fi

# Cleanup completed job (optional)
echo "🧹 Cleaning up completed bootstrap job..."
kubectl delete job localstack-secrets-bootstrap -n data-pipeline --ignore-not-found=true

echo "✅ LocalStack secrets setup complete!"
