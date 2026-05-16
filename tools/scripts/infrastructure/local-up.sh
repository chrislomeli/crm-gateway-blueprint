#!/bin/bash
# Kubernetes equivalent of "docker-compose up" - Complete local development environment
#
# Usage: ./local-up.sh [--mode=debug|k8s.md] [--fast] [--skip-build]
#   --mode=debug (default): Creates secrets for MacBook debugging (NodePort access)
#   --mode=k8s.md: Creates secrets for K8s pod deployment (internal DNS access)
#   --fast: Skip waiting for readiness checks (faster but less safe)
#   --skip-build: Skip Docker image building (use existing images)
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
DEPLOYMENT_MODE="debug"  # Default to debug mode
FAST_MODE=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --mode=*)
      DEPLOYMENT_MODE="${arg#*=}"
      shift
      ;;
    --fast)
      FAST_MODE=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

# Validate deployment mode
if [[ "$DEPLOYMENT_MODE" != "debug" && "$DEPLOYMENT_MODE" != "k8s" ]]; then
  echo -e "${RED}❌ Invalid mode: $DEPLOYMENT_MODE${NC}"
  echo "Usage: ./local-up.sh [--mode=debug|k8s] [--fast] [--skip-build]"
  exit 1
fi

echo "🚀 Starting K8s Local Development Environment"
echo "============================================="
echo "This is the Kubernetes equivalent of 'docker-compose up'"
echo "🎯 Deployment mode: $DEPLOYMENT_MODE"
if [ "$FAST_MODE" = true ]; then
  echo "⚡ Fast mode: Enabled (skipping some waits)"
fi
if [ "$SKIP_BUILD" = true ]; then
  echo "🏃 Skip build: Enabled (using existing images)"
fi
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait with timeout and status
wait_for_deployment() {
    local deployment=$1
    local namespace=$2
    local timeout=${3:-60}

    echo -n "   Waiting for $deployment..."
    if kubectl wait --for=condition=available --timeout="${timeout}s" "deployment/$deployment" -n "$namespace" 2>/dev/null; then
        echo -e " ${GREEN}✓${NC}"
        return 0
    else
        echo -e " ${YELLOW}⚠️ (timeout - continuing anyway)${NC}"
        # Show why it failed
        kubectl get pods -n "$namespace" -l app="$deployment" --no-headers 2>/dev/null || true
        return 1
    fi
}

# Check required tools
echo "🔍 Checking required tools..."
for tool in kind kubectl helm docker; do
    if ! command_exists "$tool"; then
        echo -e "${RED}❌ $tool is not installed or not in PATH${NC}"
        echo "   Install with: brew install $tool"
        exit 1
    fi
done
echo -e "${GREEN}✅ All required tools found${NC}"

echo ""
echo "🔍 Checking for existing environment..."

# Check if cluster already exists
if kind get clusters 2>/dev/null | grep -q "k8s-hello-world"; then
    echo -e "   ${YELLOW}⚠️ k8s-hello-world cluster already exists!${NC}"
    echo "   Run './scripts/infrastructure/local-down.sh' first to clean up"
    exit 1
fi

# Clean up any existing config files
rm -rf config/

echo ""
echo "🚀 Creating fresh Kubernetes cluster..."

# Ensure Chart.yaml files exist (fix common issue)
if [ -f "helm/shared-config/Chart.yml" ]; then
    mv helm/shared-config/Chart.yml helm/shared-config/Chart.yaml
fi

# Create new Kind cluster with proper port mappings
echo "   Creating Kind cluster with NodePort mappings..."
kind create cluster --config kind-cluster-config.yaml

# Wait for cluster to be ready
echo "   Waiting for cluster to be ready..."
kubectl wait --for=condition=ready nodes --all --timeout=60s

# Build and load images (can be skipped)
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "🏗️  Building and loading application images..."

    if [ -d "services/batch-loader/batch-dispatcher" ]; then
        echo "   Building contact-dispatcher image..."
        docker build -f services/batch-loader/batch-dispatcher/Dockerfile -t contact-dispatcher:latest . || {
            echo -e "   ${YELLOW}⚠️ Build failed - continuing with existing image${NC}"
        }

        echo "   Loading contact-dispatcher image into Kind cluster..."
        kind load docker-image contact-dispatcher:latest --name k8s.md-hello-world 2>/dev/null || {
            echo -e "   ${YELLOW}⚠️ Image load failed - may already exist${NC}"
        }
    else
        echo -e "   ${YELLOW}⚠️ Contact-dispatcher service not found - skipping image build${NC}"
    fi
else
    echo ""
    echo "🏃 Skipping image build (--skip-build flag set)"
fi

echo ""
echo "📦 Phase 1: Deploying infrastructure layer..."

# Deploy infrastructure with shorter timeout
echo "   Installing acme-infrastructure helm chart..."
if [ "$FAST_MODE" = true ]; then
    # Fast mode: don't wait for readiness
    helm upgrade --install acme-infrastructure ./helm/acme-infrastructure \
        --namespace acme-infrastructure \
        --create-namespace \
        --wait=false \
        --timeout 2m
    echo -e "   ${YELLOW}⚡ Fast mode: Not waiting for infrastructure readiness${NC}"
    sleep 10  # Give pods time to at least start
else
    # Normal mode: wait for infrastructure
    helm upgrade --install acme-infrastructure ./helm/acme-infrastructure \
        --namespace acme-infrastructure \
        --create-namespace \
        --wait \
        --timeout 5m || {
        echo -e "   ${YELLOW}⚠️ Infrastructure deployment timed out - checking status${NC}"
        kubectl get pods -n acme-infrastructure
    }

    echo ""
    echo "⏳ Waiting for infrastructure components..."
    wait_for_deployment "acme-infrastructure-mysql" "acme-infrastructure" 120
    wait_for_deployment "acme-infrastructure-postgres" "acme-infrastructure" 120
    wait_for_deployment "acme-infrastructure-localstack" "acme-infrastructure" 120
fi

echo ""
echo "📦 Phase 2: Deploying configuration layer..."

# Deploy shared configuration (this is usually fast)
echo "   Installing shared-config helm chart..."
helm upgrade --install shared-config ./helm/shared-config \
    --values ./helm/shared-config/values-local.yaml \
    --namespace acme-infrastructure \
    --wait=false \
    --timeout 2m

echo ""
echo "📦 Phase 3: Setting up LocalStack..."

# Setup LocalStack in background
echo "   Initializing LocalStack resources (running in background)..."
(
    sleep 10  # Give LocalStack time to fully start

    # Simple LocalStack setup without complex scripting
    kubectl exec -n acme-infrastructure deployment/acme-infrastructure-localstack -- sh -c '
        export AWS_ACCESS_KEY_ID=test
        export AWS_SECRET_ACCESS_KEY=test
        export AWS_DEFAULT_REGION=us-west-2

        # Create queues
        for queue in batch-import batch-processing file-discovery notifications dead-letter; do
            awslocal sqs create-queue --queue-name $queue >/dev/null 2>&1 || true
        done

        # Create buckets
        for bucket in acme-crm-local batch-files-local processed-files-local reports-local; do
            awslocal s3 mb s3://$bucket >/dev/null 2>&1 || true
        done

        echo "LocalStack resources created"
    ' 2>/dev/null || echo -e "   ${YELLOW}⚠️ LocalStack setup will complete in background${NC}"
) &

LOCALSTACK_PID=$!

echo ""
echo "📦 Phase 4: Deploying application layer..."

# Deploy batch processing with reduced timeout and no waiting
echo "   Installing batch-processing helm chart..."
echo -e "   ${YELLOW}Note: This often takes 30-60 seconds...${NC}"

if [ "$FAST_MODE" = true ]; then
    # Fast mode: Install without waiting
    helm upgrade --install batch-processing ./helm/batch-processing \
        --values ./helm/batch-processing/values-local.yaml \
        --namespace acme-services \
        --create-namespace \
        --wait=false \
        --timeout 1m
    echo -e "   ${GREEN}✓ Batch processing deployment started (not waiting for readiness)${NC}"
else
    # Normal mode: Try to wait but don't fail
    helm upgrade --install batch-processing ./helm/batch-processing \
        --values ./helm/batch-processing/values-local.yaml \
        --namespace acme-services \
        --create-namespace \
        --wait \
        --timeout 3m || {
        echo -e "   ${YELLOW}⚠️ Batch processing deployment timed out${NC}"
        echo "   This is often OK - pods may still be starting up"
        echo "   Checking pod status:"
        kubectl get pods -n acme-services
    }
fi

echo ""
echo "🔧 Phase 5: Local development setup..."

# Render pod configs for local development
if [ -f "./scripts/config/render-pod-configs.sh" ]; then
    echo "   Rendering pod filesystem structure for local development..."
    ./scripts/config/render-pod-configs.sh local 2>/dev/null || {
        echo -e "   ${YELLOW}⚠️ Config rendering failed - may not be needed${NC}"
    }
else
    echo -e "   ${YELLOW}⚠️ Config rendering script not found - skipping${NC}"
fi

# Wait for background LocalStack setup
wait $LOCALSTACK_PID 2>/dev/null || true

echo ""
echo "📊 Current Status:"
echo "=================="
kubectl get pods --all-namespaces | grep -E "NAME|acme-" || true

echo ""
echo "🎉 Local Development Environment Started!"
echo "========================================="
echo ""
echo "🌐 Service Access (NodePort):"
echo "   MySQL:      localhost:30306 (user: root, password: root_password)"
echo "   PostgreSQL: localhost:30432 (user: postgres, password: postgres_password)"
echo "   LocalStack: localhost:30568 (AWS services emulation)"
echo ""
echo "📁 Local Development:"
echo "   Config files: ./config/shared/shared.yaml"
echo ""
echo "🔧 Debugging Commands:"
echo "   Check pod status:    kubectl get pods --all-namespaces"
echo "   Check pod logs:      kubectl logs -n acme-services <pod-name>"
echo "   Describe pod:        kubectl describe pod -n acme-services <pod-name>"
echo "   Get events:          kubectl get events --all-namespaces --sort-by='.lastTimestamp'"
echo "   Test connection:     curl http://localhost:30568/_localstack/health"
echo ""
echo "🧹 Cleanup:"
echo "   Tear down:          kind delete cluster --name k8s-hello-world"
echo ""

# Final status check
if [ "$FAST_MODE" = false ]; then
    echo "⏳ Waiting for all pods to be ready (this may take a minute)..."
    sleep 10

    # Check if critical pods are running
    MYSQL_READY=$(kubectl get pods -n acme-infrastructure -l app=acme-infrastructure-mysql -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Unknown")
    POSTGRES_READY=$(kubectl get pods -n acme-infrastructure -l app=acme-infrastructure-postgres -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Unknown")
    LOCALSTACK_READY=$(kubectl get pods -n acme-infrastructure -l app=acme-infrastructure-localstack -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Unknown")

    echo ""
    echo "📊 Component Status:"
    echo "   MySQL:      $MYSQL_READY"
    echo "   PostgreSQL: $POSTGRES_READY"
    echo "   LocalStack: $LOCALSTACK_READY"

    if [[ "$MYSQL_READY" == "Running" && "$POSTGRES_READY" == "Running" && "$LOCALSTACK_READY" == "Running" ]]; then
        echo ""
        echo -e "${GREEN}✅ All infrastructure components are running!${NC}"
    else
        echo ""
        echo -e "${YELLOW}⚠️ Some components may still be starting up. Use the debugging commands above to check status.${NC}"
    fi
fi

echo ""
echo "💡 Tip: If deployments are timing out, try:"
echo "   1. Run with --fast flag for quicker startup"
echo "   2. Check pod logs for specific errors"
echo "   3. Ensure Docker has enough resources (8GB+ RAM recommended)"