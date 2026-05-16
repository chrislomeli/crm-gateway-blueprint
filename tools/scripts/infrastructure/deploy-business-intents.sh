#!/bin/bash

# Deploy Business Intent Database Bootstrap
# This script deploys the business intent data to the MySQL database for webhook subscriber testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_LOCAL_DIR="$PROJECT_ROOT/k8s/local"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_WAIT_TIME=300  # Maximum wait time in seconds
POLL_INTERVAL=5    # How often to check status

echo "🚀 Deploying Business Intent Database Bootstrap..."
echo "================================================"

# Function to check if MySQL is ready
check_mysql_ready() {
    echo -e "${BLUE}🔍 Checking MySQL availability...${NC}"

    # Try multiple ways to find MySQL pod
    # Method 1: Try common label patterns
    for label in "app=acme-infrastructure-mysql" "app=mysql" "app.kubernetes.io/name=mysql" "component=mysql"; do
        MYSQL_POD=$(kubectl get pods -n acme-infrastructure -l "$label" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
        if [ -n "$MYSQL_POD" ]; then
            echo -e "   Found MySQL pod using label: $label"
            break
        fi
    done

    # Method 2: If no labeled pod found, search by name pattern
    if [ -z "$MYSQL_POD" ]; then
        MYSQL_POD=$(kubectl get pods -n acme-infrastructure -o name 2>/dev/null | grep -i mysql | head -1 | sed 's|pod/||' || echo "")
        if [ -n "$MYSQL_POD" ]; then
            echo -e "   Found MySQL pod by name pattern: $MYSQL_POD"
        fi
    fi

    # Method 3: Check if there's a mysql deployment
    if [ -z "$MYSQL_POD" ]; then
        MYSQL_DEPLOYMENT=$(kubectl get deployments -n acme-infrastructure -o name 2>/dev/null | grep -i mysql | head -1 || echo "")
        if [ -n "$MYSQL_DEPLOYMENT" ]; then
            MYSQL_POD=$(kubectl get pods -n acme-infrastructure -l "app=${MYSQL_DEPLOYMENT##*/}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
            if [ -n "$MYSQL_POD" ]; then
                echo -e "   Found MySQL pod via deployment: $MYSQL_DEPLOYMENT"
            fi
        fi
    fi

    if [ -z "$MYSQL_POD" ]; then
        echo -e "${RED}❌ MySQL pod not found!${NC}"
        echo "   Current pods in acme-infrastructure namespace:"
        kubectl get pods -n acme-infrastructure 2>/dev/null || echo "   No pods found or namespace doesn't exist"
        echo ""
        echo "   Please ensure MySQL is deployed first."
        echo "   If MySQL is running with a different label, you can check with:"
        echo "   kubectl get pods -n acme-infrastructure --show-labels"
        return 1
    fi

    # Check pod status
    POD_STATUS=$(kubectl get pod "$MYSQL_POD" -n acme-infrastructure -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
    if [ "$POD_STATUS" != "Running" ]; then
        echo -e "${YELLOW}⚠️  MySQL pod exists but is not running (Status: $POD_STATUS)${NC}"
        echo "   Pod: $MYSQL_POD"
        return 1
    fi

    # Check if MySQL is accepting connections
    echo -e "   Testing MySQL connection in pod: $MYSQL_POD"

    # First check if mysqladmin exists in the container
    if kubectl exec -n acme-infrastructure "$MYSQL_POD" -- which mysqladmin >/dev/null 2>&1; then
        kubectl exec -n acme-infrastructure "$MYSQL_POD" -- mysqladmin ping -h localhost -u root -proot_password >/dev/null 2>&1 || {
            echo -e "${YELLOW}⚠️  MySQL is running but not accepting connections${NC}"
            echo "   Trying with different credentials..."

            # Try without password
            kubectl exec -n acme-infrastructure "$MYSQL_POD" -- mysqladmin ping -h localhost -u root >/dev/null 2>&1 || {
                echo -e "${YELLOW}⚠️  MySQL is not ready or requires different credentials${NC}"
                return 1
            }
        }
    else
        # If mysqladmin doesn't exist, try mysql command
        echo -e "   Using mysql client to test connection..."
        kubectl exec -n acme-infrastructure "$MYSQL_POD" -- mysql -h localhost -u root -proot_password -e "SELECT 1" >/dev/null 2>&1 || {
            # Try without password
            kubectl exec -n acme-infrastructure "$MYSQL_POD" -- mysql -h localhost -u root -e "SELECT 1" >/dev/null 2>&1 || {
                echo -e "${YELLOW}⚠️  Cannot connect to MySQL${NC}"
                echo "   The pod is running but MySQL might still be initializing"
                return 1
            }
        }
    fi

    echo -e "${GREEN}✅ MySQL is ready (Pod: $MYSQL_POD)${NC}"
    return 0
}

# Function to clean up existing job if it exists
cleanup_existing_job() {
    if kubectl get job mysql-init-business-intents >/dev/null 2>&1; then
        echo -e "${YELLOW}🧹 Cleaning up existing job...${NC}"
        kubectl delete job mysql-init-business-intents --ignore-not-found=true
        sleep 2
    fi
}

# Function to wait for job with better status reporting
wait_for_job_completion() {
    local job_name=$1
    local namespace=${2:-default}
    local elapsed=0

    echo -e "${BLUE}⏳ Waiting for job '$job_name' to complete...${NC}"
    echo "   Maximum wait time: ${MAX_WAIT_TIME}s"

    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        # Get job status
        JOB_STATUS=$(kubectl get job "$job_name" -n "$namespace" -o json 2>/dev/null | jq -r '.status' || echo "{}")

        # Check if job succeeded
        SUCCEEDED=$(echo "$JOB_STATUS" | jq -r '.succeeded // 0')
        FAILED=$(echo "$JOB_STATUS" | jq -r '.failed // 0')
        ACTIVE=$(echo "$JOB_STATUS" | jq -r '.active // 0')

        # Get pod status for more details
        POD_NAME=$(kubectl get pods -n "$namespace" -l job-name="$job_name" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
        POD_STATUS=""
        if [ -n "$POD_NAME" ]; then
            POD_STATUS=$(kubectl get pod "$POD_NAME" -n "$namespace" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
            CONTAINER_STATUS=$(kubectl get pod "$POD_NAME" -n "$namespace" -o jsonpath='{.status.containerStatuses[0].state}' 2>/dev/null || echo "{}")
        fi

        # Display current status
        echo -ne "\r   ⏱️  Elapsed: ${elapsed}s | Active: $ACTIVE | Succeeded: $SUCCEEDED | Failed: $FAILED | Pod: $POD_STATUS    "

        # Check completion conditions
        if [ "$SUCCEEDED" -gt 0 ]; then
            echo -e "\n${GREEN}✅ Job completed successfully!${NC}"
            return 0
        fi

        if [ "$FAILED" -gt 0 ]; then
            echo -e "\n${RED}❌ Job failed!${NC}"

            # Show pod logs for debugging
            if [ -n "$POD_NAME" ]; then
                echo -e "${YELLOW}📋 Pod logs:${NC}"
                kubectl logs "$POD_NAME" -n "$namespace" --tail=50 || echo "Could not retrieve logs"

                echo -e "${YELLOW}📋 Pod events:${NC}"
                kubectl describe pod "$POD_NAME" -n "$namespace" | grep -A 10 "Events:" || true
            fi
            return 1
        fi

        # Check for specific pod issues
        if [ -n "$POD_NAME" ] && [ "$POD_STATUS" = "Pending" ]; then
            # Check why pod is pending
            REASON=$(kubectl get pod "$POD_NAME" -n "$namespace" -o jsonpath='{.status.conditions[?(@.type=="PodScheduled")].reason}' 2>/dev/null || echo "")
            if [ -n "$REASON" ]; then
                echo -e "\n${YELLOW}⚠️  Pod is pending: $REASON${NC}"
            fi
        fi

        # Check if pod is in error/crash loop
        if echo "$CONTAINER_STATUS" | grep -q "Error\|CrashLoopBackOff"; then
            echo -e "\n${RED}❌ Pod is in error state!${NC}"
            echo -e "${YELLOW}📋 Recent logs:${NC}"
            kubectl logs "$POD_NAME" -n "$namespace" --tail=20 || echo "Could not retrieve logs"
            return 1
        fi

        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done

    echo -e "\n${YELLOW}⚠️  Job did not complete within ${MAX_WAIT_TIME}s${NC}"

    # Show current state for debugging
    echo -e "${YELLOW}📋 Current job status:${NC}"
    kubectl describe job "$job_name" -n "$namespace" | tail -20

    if [ -n "$POD_NAME" ]; then
        echo -e "${YELLOW}📋 Pod logs (last 30 lines):${NC}"
        kubectl logs "$POD_NAME" -n "$namespace" --tail=30 || echo "Could not retrieve logs"
    fi

    return 2  # Timeout
}

# Main execution
echo ""

# Step 1: Check MySQL is ready first
if ! check_mysql_ready; then
    echo -e "${RED}❌ MySQL is not available. Please ensure infrastructure is running first.${NC}"
    echo "   Run: ./local-up.sh"
    exit 1
fi

# Step 2: Clean up any existing job
cleanup_existing_job

# Step 3: Apply the ConfigMap
echo -e "${BLUE}📊 Creating business intent data ConfigMap...${NC}"
if [ ! -f "$K8S_LOCAL_DIR/business-intent-data-configmap.yaml" ]; then
    echo -e "${RED}❌ ConfigMap file not found: $K8S_LOCAL_DIR/business-intent-data-configmap.yaml${NC}"
    exit 1
fi
kubectl apply -f "$K8S_LOCAL_DIR/business-intent-data-configmap.yaml"

# Step 4: Apply the initialization job
echo -e "${BLUE}🔧 Creating business intent initialization job...${NC}"
if [ ! -f "$K8S_LOCAL_DIR/mysql-init-business-intents.yaml" ]; then
    echo -e "${RED}❌ Job file not found: $K8S_LOCAL_DIR/mysql-init-business-intents.yaml${NC}"
    exit 1
fi

# Check the job yaml for potential issues
echo -e "${BLUE}🔍 Checking job configuration...${NC}"
kubectl apply -f "$K8S_LOCAL_DIR/mysql-init-business-intents.yaml" --dry-run=client || {
    echo -e "${RED}❌ Job configuration validation failed${NC}"
    exit 1
}

# Apply the job
kubectl apply -f "$K8S_LOCAL_DIR/mysql-init-business-intents.yaml"

# Give the job a moment to be created
sleep 2

# Step 5: Wait for job completion with detailed monitoring
if wait_for_job_completion "mysql-init-business-intents" "default"; then
    echo ""
    echo -e "${GREEN}✅ Business intent data loaded successfully!${NC}"

    # Show job logs for confirmation
    echo ""
    echo -e "${BLUE}📋 Job execution summary:${NC}"
    POD_NAME=$(kubectl get pods -l job-name=mysql-init-business-intents -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$POD_NAME" ]; then
        kubectl logs "$POD_NAME" --tail=20 || echo "Could not retrieve logs"
    fi

    # Step 6: Verify data was loaded (non-interactive)
    echo ""
    echo -e "${BLUE}🔍 Verifying business intent data...${NC}"

    # Create a temporary verification job instead of interactive run
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: verify-business-intent
spec:
  ttlSecondsAfterFinished: 60
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: mysql-client
        image: mysql:8.0
        command:
        - sh
        - -c
        - |
          mysql -hmysql.acme-infrastructure.svc.cluster.local -upipeline_user -ppipeline_password -e "
          USE calls;
          SELECT 'Business Intent Data Summary:' as '';
          SELECT COUNT(*) as total_businesses,
                 COUNT(DISTINCT intentFieldName) as unique_intent_fields,
                 MIN(intentScoreThreshold) as min_threshold,
                 MAX(intentScoreThreshold) as max_threshold,
                 ROUND(AVG(intentScoreThreshold), 2) as avg_threshold
          FROM businessDetails
          WHERE intentFieldName IS NOT NULL;

          SELECT 'Sample Business Intent Records:' as '';
          SELECT businessId, intentFieldName, intentFieldLabel, intentScoreThreshold
          FROM businessDetails
          WHERE intentFieldName IS NOT NULL
          LIMIT 5;"
EOF

    # Wait for verification to complete
    sleep 3
    if kubectl wait --for=condition=complete --timeout=30s job/verify-business-intent 2>/dev/null; then
        echo -e "${BLUE}📊 Verification results:${NC}"
        VERIFY_POD=$(kubectl get pods -l job-name=verify-business-intent -o jsonpath='{.items[0].metadata.name}')
        kubectl logs "$VERIFY_POD" || echo "Could not retrieve verification results"
    else
        echo -e "${YELLOW}⚠️  Could not verify data (this may be normal if MySQL uses different credentials)${NC}"
    fi

    # Clean up verification job
    kubectl delete job verify-business-intent --ignore-not-found=true

else
    EXIT_CODE=$?
    echo ""
    if [ $EXIT_CODE -eq 2 ]; then
        echo -e "${YELLOW}⚠️  Business intent initialization timed out!${NC}"
        echo ""
        echo "🔧 Troubleshooting steps:"
        echo "   1. Check if MySQL is accessible:"
        echo "      kubectl exec -it deploy/acme-infrastructure-mysql -n acme-infrastructure -- mysql -uroot -proot_password"
        echo ""
        echo "   2. Check job pod status:"
        echo "      kubectl get pods -l job-name=mysql-init-business-intents"
        echo ""
        echo "   3. Check job logs:"
        echo "      kubectl logs -l job-name=mysql-init-business-intents"
        echo ""
        echo "   4. Check job yaml configuration:"
        echo "      kubectl describe job mysql-init-business-intents"
    else
        echo -e "${RED}❌ Business intent initialization failed!${NC}"
    fi
    exit 1
fi

echo ""
echo "🎉 Business Intent Bootstrap Complete!"
echo "======================================"
echo ""
echo "📈 Summary:"
echo "   • Created businessDetails table with intent configuration"
echo "   • Loaded comprehensive test data for webhook subscriber validation"
echo "   • Ready for intent cache JIT initialization testing"
echo ""
echo "🔧 Next Steps:"
echo "   • Test the webhook subscriber service with JIT cache initialization"
echo "   • Verify intent processing with different threshold values"
echo "   • Run end-to-end validation with business intent data"
echo ""
echo "💡 Useful commands:"
echo "   • Delete job:  kubectl delete job mysql-init-business-intents"
echo "   • View logs:   kubectl logs -l job-name=mysql-init-business-intents"
echo "   • Check data:  kubectl exec -it deploy/acme-infrastructure-mysql -n acme-infrastructure -- mysql -uroot -proot_password calls"