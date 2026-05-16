#!/bin/bash
# cluster-switch.sh - Switch between local and dev clusters

set -e

CLUSTER_NAME=""
OVERLAY=""

case "$1" in
    "local")
        CLUSTER_NAME="acme-local"
        OVERLAY="local"
        ;;
    "dev")
        CLUSTER_NAME="acme-dev"
        OVERLAY="dev"
        ;;
    *)
        echo "Usage: $0 {local|dev}"
        echo ""
        echo "  local - Switch to acme-local cluster (full stack with LocalStack)"
        echo "  dev   - Switch to acme-dev cluster (config-only for debugging)"
        exit 1
        ;;
esac

echo "🔄 Switching to $CLUSTER_NAME cluster..."

# Check if cluster exists
if ! kind get clusters | grep -q "^$CLUSTER_NAME$"; then
    echo "❌ Cluster '$CLUSTER_NAME' not found"
    echo "💡 Create it with:"
    if [ "$CLUSTER_NAME" = "acme-local" ]; then
        echo "   kind create cluster --config infrastructure/kind/kind-cluster-config.yaml"
    else
        echo "   kind create cluster --config infrastructure/kind/kind-cluster-dev-config.yaml"
    fi
    exit 1
fi

# Switch kubectl context
kubectl config use-context "kind-$CLUSTER_NAME"

echo "✅ Switched to cluster: $CLUSTER_NAME"
echo "📋 Current context: $(kubectl config current-context)"
echo ""
echo "💡 To deploy the $OVERLAY overlay:"
echo "   kubectl apply -k infrastructure/k8s/overlays/$OVERLAY"
echo ""
echo "💡 To extract configs for local debugging:"
echo "   ./tools/scripts/setup.configs.sh"
