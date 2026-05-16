#!/bin/bash
set -e

echo "🔍 Validating ConfigMaps contain !ssm<secret>[field] patterns..."

# Function to check ConfigMaps in a namespace
check_configmaps() {
    local namespace=$1
    echo ""
    echo "📦 Namespace: $namespace"
    echo "----------------------------------------"
    
    # Get all ConfigMaps in namespace
    local configmaps=$(kubectl get configmaps -n "$namespace" --no-headers -o custom-columns=":metadata.name" 2>/dev/null || echo "")
    
    if [ -z "$configmaps" ]; then
        echo "   ℹ️  No ConfigMaps found in namespace $namespace"
        return 0
    fi
    
    local found_secrets=false
    
    for cm in $configmaps; do
        echo "   🔍 Checking ConfigMap: $cm"
        
        # Check if ConfigMap contains !ssm patterns
        local ssm_patterns=$(kubectl get configmap "$cm" -n "$namespace" -o yaml | grep -c "!ssm<.*>\[.*\]" 2>/dev/null || echo "0")
        
        # Clean up any whitespace/newlines from the count
        ssm_patterns=$(echo "$ssm_patterns" | tr -d '\n\r' | tr -d ' ')
        
        if [ "$ssm_patterns" -gt 0 ] 2>/dev/null; then
            echo "      ✅ Found $ssm_patterns !ssm<secret>[field] patterns"
            found_secrets=true
            
            # Show the patterns found
            kubectl get configmap "$cm" -n "$namespace" -o yaml | grep "!ssm<.*>\[.*\]" | sed 's/^/         /'
        else
            echo "      ℹ️  No !ssm patterns found"
        fi
    done
    
    if [ "$found_secrets" = true ]; then
        echo "   ✅ ConfigMaps contain secret reference patterns"
        return 0
    else
        echo "   ⚠️  No !ssm<secret>[field] patterns found in any ConfigMaps"
        return 1
    fi
}

# Check critical namespaces
NAMESPACES=("acme-services")
overall_status=0

for ns in "${NAMESPACES[@]}"; do
    if ! check_configmaps "$ns"; then
        overall_status=1
    fi
done

echo ""
echo "🎯 ConfigMap Validation Summary:"
if [ $overall_status -eq 0 ]; then
    echo "✅ ConfigMaps properly configured with !ssm<secret>[field] patterns"
else
    echo "❌ ConfigMaps missing secret reference patterns"
fi

exit $overall_status
