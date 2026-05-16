#!/bin/bash
set -e

echo "🚀 Setting up K8s Hello World Monorepo"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build the project
echo "🔨 Building packages..."
pnpm build

# Build Docker image
echo "🐳 Building Docker image..."
cd services/helloworld
docker build -t helloworld:latest ../..

# Create kind cluster if it doesn't exist
if ! kind get clusters | grep -q "hello-cluster"; then
    echo "☸️  Creating kind cluster..."
    kind create cluster --name hello-cluster
else
    echo "☸️  Using existing kind cluster..."
fi

# Load image into kind
echo "📤 Loading image into kind..."
kind load docker-image helloworld:latest --name hello-cluster

# Apply Kubernetes manifests
echo "🚀 Deploying to Kubernetes..."
kubectl apply -f k8s.md/

# Wait for deployment
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/helloworld

# Port forward
echo "🌐 Setting up port forwarding..."
echo "Your service will be available at http://localhost:8080"
echo "Press Ctrl+C to stop port forwarding"
kubectl port-forward service/helloworld-service 8080:80