#!/bin/bash
set -e

echo "🔍 Checking pod health across all namespaces..."

# Function to check pods in a namespace
check_namespace_pods() {
    local namespace=$1
    echo ""
    echo "📦 Namespace: $namespace"
    echo "----------------------------------------"
    
    if ! kubectl get pods -n "$namespace" --no-headers 2>/dev/null | grep -q .; then
        echo "   ℹ️  No pods found in namespace $namespace"
        return 0
    fi
    
    # Get pod status
    kubectl get pods -n "$namespace" -o wide
    
    # Check for any non-running pods
    local failed_pods=$(kubectl get pods -n "$namespace" --no-headers | grep -v "Running\|Completed" | wc -l)
    if [ "$failed_pods" -gt 0 ]; then
        echo "   ⚠️  Found $failed_pods non-running pods"
        kubectl get pods -n "$namespace" --no-headers | grep -v "Running\|Completed" | while read line; do
            pod_name=$(echo "$line" | awk '{print $1}')
            echo "   🔍 Logs for failed pod: $pod_name"
            kubectl logs "$pod_name" -n "$namespace" --tail=10 || echo "   ❌ Could not retrieve logs"
        done
        return 1
    else
        echo "   ✅ All pods running successfully"
        return 0
    fi
}

# Check critical namespaces
NAMESPACES=("acme-infrastructure" "acme-services")
overall_status=0

for ns in "${NAMESPACES[@]}"; do
    if ! check_namespace_pods "$ns"; then
        overall_status=1
    fi
done

echo ""
echo "🎯 Pod Health Check Summary:"
if [ $overall_status -eq 0 ]; then
    echo "✅ All pods are healthy across all namespaces"
else
    echo "❌ Some pods have issues - check logs above"
fi

exit $overall_status
