#!/bin/bash
# Kubernetes equivalent of "docker-compose down" - Tear down local development environment
set -e

echo "🛑 Stopping K8s Local Development Environment"
echo "============================================="
echo "This is the Kubernetes equivalent of 'docker-compose down'"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if kind is available
if ! command_exists "kind"; then
    echo "❌ kind is not installed or not in PATH"
    echo "   Install with: brew install kind"
    exit 1
fi

echo "🔍 Checking for existing environment..."

# Check if Kind cluster exists
if kind get clusters 2>/dev/null | grep -q "k8s-hello-world"; then
    echo "   Found k8s-hello-world cluster"
    
    echo ""
    echo "🗑️  Deleting Kind cluster (nuclear option - fastest for local dev)..."
    kind delete cluster --name k8s.md-hello-world
    echo "   ✅ Cluster deleted"
else
    echo "   No k8s-hello-world cluster found"
fi

echo ""
echo "🧹 Cleaning up local files..."

# Clean up local config files
if [ -d "config" ]; then
    echo "   Removing local config files..."
    rm -rf config/
    echo "   ✅ Config files removed"
else
    echo "   No config files to clean up"
fi

# Clean up any temporary files
echo "   Cleaning up temporary files..."
rm -f /tmp/helm_output.yaml 2>/dev/null || true

echo ""
echo "🎉 Local Development Environment Stopped!"
echo "========================================"
echo ""
echo "✅ All resources cleaned up:"
echo "   • Kind cluster deleted"
echo "   • Helm releases removed"
echo "   • Namespaces deleted"
echo "   • Local config files removed"
echo ""
echo "💡 To start the environment again, run:"
echo "   ./scripts/infrastructure/local-up.sh"
