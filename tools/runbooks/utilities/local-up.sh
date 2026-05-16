#!/bin/bash
set -e

echo "🔄 Rebooting K8s Batch Processing Environment"
echo "=============================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required tools
echo "🔍 Checking required tools..."
for tool in kind kubectl helm docker; do
    if ! command_exists "$tool"; then
        echo "❌ $tool is not installed or not in PATH"
        exit 1
    fi
done
echo "✅ All required tools found"

echo ""
echo "🛑 Stopping current environment..."

# Delete existing Kind cluster
if kind get clusters 2>/dev/null | grep -q "k8s-hello-world"; then
    echo "   Deleting existing Kind cluster..."
    kind delete cluster --name k8s.md-hello-world
else
    echo "   No existing cluster found"
fi

echo ""
echo "🚀 Starting fresh environment..."

# Create new Kind cluster with proper port mappings
echo "   Creating Kind cluster with port mappings..."
kind create cluster --config kind-cluster-config.yaml

# Wait for cluster to be ready
echo "   Waiting for cluster to be ready..."
kubectl wait --for=condition=ready nodes --all --timeout=60s

echo ""
echo "🏗️  Building and loading Docker images..."

# Build batch dispatcher image
echo "   Building batch-dispatcher image..."
docker build -f services/batch-loader/batch-dispatcher/Dockerfile -t batch-dispatcher:latest .

# Load images into Kind cluster
echo "   Loading images into Kind cluster..."
kind load docker-image batch-dispatcher:latest --name k8s.md-hello-world

echo ""
echo "📦 Deploying infrastructure..."

# Deploy infrastructure (MySQL, LocalStack, etc.)
echo "   Deploying acme-infrastructure..."
helm upgrade --install acme-infrastructure ./helm/acme-infrastructure \
    --namespace acme-infrastructure \
    --create-namespace \
    --wait

echo ""
echo "⏳ Waiting for infrastructure to be ready..."

# Wait for MySQL to be ready
kubectl wait --for=condition=available --timeout=300s deployment/acme-infrastructure-mysql -n acme-infrastructure

# Wait for LocalStack to be ready
kubectl wait --for=condition=available --timeout=300s deployment/acme-infrastructure-localstack -n acme-infrastructure

echo ""
echo "🔧 Initializing databases and secrets..."

# Initialize MySQL database
echo "   Initializing MySQL database..."
# Check if MySQL is ready
if kubectl get pods -n acme-infrastructure -l component=mysql | grep -q Running; then
    echo "   ✅ MySQL is running, applying schema..."
    # Apply MySQL schema using the existing job
    kubectl apply -f k8s.md/mysql-batch-init.yaml
    echo "   📝 MySQL init job submitted (running in background)"
else
    echo "   ❌ MySQL is not ready yet"
    exit 1
fi

# Setup LocalStack secrets (without waiting)
echo "   Setting up LocalStack secrets..."
echo "   📝 Creating LocalStack secrets bootstrap job..."
# Create namespace if it doesn't exist
kubectl create namespace acme-infrastructure --dry-run=client -o yaml | kubectl apply -f - >/dev/null 2>&1 || true
# Apply the bootstrap job but don't wait
kubectl apply -f scripts/localstack-secrets-bootstrap.yaml --dry-run=client -o yaml | \
    sed 's/namespace: data-pipeline/namespace: acme-infrastructure/g' | \
    kubectl apply -f - || echo "   ⚠️ Bootstrap job may already exist"
echo "   📝 LocalStack secrets job submitted (running in background)"

# Create SQS queues using kubectl exec into LocalStack
echo "   Creating SQS queues..."
kubectl exec -n acme-infrastructure deployment/acme-infrastructure-localstack -- sh -c "
  awslocal sqs create-queue --queue-name batch-import-dev --region us-west-2 >/dev/null 2>&1 || echo 'Queue may already exist'
" || echo "   ⚠️ Could not create queue via LocalStack pod (may not be ready yet)"

echo "   📝 SQS queue creation attempted (LocalStack may still be initializing)"

echo ""
echo "📊 Deploying batch processing services..."

# Deploy batch processing
echo "   Deploying batch-processing..."
helm upgrade --install batch-processing ./helm/batch-processing \
    --namespace acme-services \
    --create-namespace \
    --wait

echo ""
echo "🎉 Environment ready!"
echo "==================="
echo ""
echo "📊 Access Information:"
echo "   MySQL:     localhost:30306 (user: root, password: root_password)"
echo "   LocalStack: localhost:30568"
echo "   Database:   acme"
echo ""
echo "🔧 Quick Commands:"
echo "   Check pods:    kubectl get pods --all-namespaces"
echo "   MySQL query:   mysql -h localhost -P 30306 -u root -proot_password -D acme"
echo "   Run dispatcher: ./runbooks/utilities/trigger-dispatcher.sh"
echo ""
echo "✅ Ready for batch processing pipeline testing!"
