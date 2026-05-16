#!/bin/bash
set -e

echo "🔍 Checking required Docker images..."

# Configuration
NAMESPACE=${NAMESPACE:-"acme-services"}
REQUIRED_IMAGES=()

# Function to extract image from CronJob or Deployment
get_cronjob_image() {
    local cronjob_name=$1
    local namespace=$2
    kubectl get cronjob "$cronjob_name" -n "$namespace" -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[0].image}' 2>/dev/null || echo ""
}

get_deployment_image() {
    local deployment_name=$1
    local namespace=$2
    kubectl get deployment "$deployment_name" -n "$namespace" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo ""
}

# Function to check if image exists in Kind cluster
check_image_in_kind() {
    local image=$1
    echo "   Checking image: $image"
    
    # Get the Kind cluster name from current kubectl context
    local current_context=$(kubectl config current-context 2>/dev/null)
    local kind_cluster=""
    
    # Extract cluster name from context (format: kind-<cluster-name>)
    if [[ "$current_context" =~ ^kind-(.+)$ ]]; then
        kind_cluster="${BASH_REMATCH[1]}"
    else
        # Fallback to first available Kind cluster
        kind_cluster=$(kind get clusters | head -n1)
    fi
    
    if [ -z "$kind_cluster" ]; then
        echo "   ❌ No Kind cluster found"
        return 1
    fi
    
    # Check if image exists in Kind cluster
    # Extract image name without tag for more flexible matching
    local image_name="${image%:*}"
    if docker exec "${kind_cluster}-control-plane" crictl images | grep -q "${image_name}" 2>/dev/null; then
        echo "   ✅ Image $image found in Kind cluster"
        return 0
    else
        echo "   ❌ Image $image NOT found in Kind cluster"
        return 1
    fi
}

echo ""
echo "📋 Scanning for CronJobs and Deployments..."

# Find all CronJobs in the namespace
cronjobs=$(kubectl get cronjobs -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -n "$cronjobs" ]; then
    echo "   Found CronJobs: $cronjobs"
    for cronjob in $cronjobs; do
        image=$(get_cronjob_image "$cronjob" "$NAMESPACE")
        if [ -n "$image" ]; then
            REQUIRED_IMAGES+=("$image")
        fi
    done
fi

# Find all Deployments in the namespace
deployments=$(kubectl get deployments -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -n "$deployments" ]; then
    echo "   Found Deployments: $deployments"
    for deployment in $deployments; do
        image=$(get_deployment_image "$deployment" "$NAMESPACE")
        if [ -n "$image" ]; then
            REQUIRED_IMAGES+=("$image")
        fi
    done
fi

# Remove duplicates
UNIQUE_IMAGES=($(printf "%s\n" "${REQUIRED_IMAGES[@]}" | sort -u))

echo ""
echo "🎯 Required images found:"
for image in "${UNIQUE_IMAGES[@]}"; do
    echo "   - $image"
done

echo ""
echo "🔍 Checking image availability in Kind cluster..."

missing_images=()
for image in "${UNIQUE_IMAGES[@]}"; do
    if ! check_image_in_kind "$image"; then
        missing_images+=("$image")
    fi
done

echo ""
if [ ${#missing_images[@]} -eq 0 ]; then
    echo "✅ All required images are available in Kind cluster"
    echo "🚀 Ready to run jobs and deployments"
else
    echo "❌ Missing images detected:"
    for image in "${missing_images[@]}"; do
        echo "   - $image"
    done
    echo ""
    echo "💡 To fix missing images, you can:"
    echo "   1. Build the image: docker build -t <image-name> <path-to-dockerfile>"
    echo "   2. Load into Kind: kind load docker-image <image-name> --name <cluster-name>"
    echo "   3. Or pull from registry: docker pull <image-name> && kind load docker-image <image-name>"
    echo ""
    exit 1
fi
