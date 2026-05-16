#!/bin/bash
# Orchestrator script to validate complete local development environment
set -e

echo "🔍 Local Development Environment Validation"
echo "=========================================="
echo "Running comprehensive validation of all components..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run validation script
run_validation() {
    local script_name="$1"
    local description="$2"
    local script_path="./scripts/validation/$script_name"
    
    echo -e "${BLUE}🧪 $description${NC}"
    echo "   Running: $script_name"
    
    ((TOTAL_TESTS++))
    
    if [ -f "$script_path" ]; then
        if bash "$script_path" >/dev/null 2>&1; then
            echo -e "   ${GREEN}✅ PASSED${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "   ${RED}❌ FAILED${NC}"
            echo "   Run manually for details: $script_path"
            ((FAILED_TESTS++))
        fi
    else
        echo -e "   ${RED}❌ SCRIPT NOT FOUND${NC}: $script_path"
        ((FAILED_TESTS++))
    fi
    echo ""
}

# Function to run testing script
run_test() {
    local script_name="$1"
    local description="$2"
    local script_path="./scripts/testing/$script_name"
    
    echo -e "${BLUE}🧪 $description${NC}"
    echo "   Running: $script_name"
    
    ((TOTAL_TESTS++))
    
    if [ -f "$script_path" ]; then
        if bash "$script_path" >/dev/null 2>&1; then
            echo -e "   ${GREEN}✅ PASSED${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "   ${RED}❌ FAILED${NC}"
            echo "   Run manually for details: $script_path"
            ((FAILED_TESTS++))
        fi
    else
        echo -e "   ${RED}❌ SCRIPT NOT FOUND${NC}: $script_path"
        ((FAILED_TESTS++))
    fi
    echo ""
}

# Check prerequisites
echo "🔧 Checking prerequisites..."
if ! command -v kubectl >/dev/null 2>&1; then
    echo -e "${RED}❌ kubectl not found - install with: brew install kubectl${NC}"
    exit 1
fi

if ! kubectl cluster-info >/dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
    echo "   Run: ./scripts/infrastructure/local-up.sh"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites met${NC}"
echo ""

# Run infrastructure validation
echo "🏗️  Infrastructure Components"
echo "=============================="
run_validation "check-pods.sh" "Pod Status Validation"
run_test "test-localstack-connectivity.sh" "LocalStack Connectivity"
run_test "test-database-connectivity.sh" "Database Connectivity"

# Run configuration validation
echo "⚙️  Configuration Validation"
echo "============================"
run_validation "validate-configmaps.sh" "ConfigMap Validation"

# Run service validation
echo "🔧 Service Initialization"
echo "========================="
run_validation "check-s3-buckets.sh" "S3 Bucket Setup"
run_validation "check-sqs-queues.sh" "SQS Queue Setup"
run_validation "check-secrets-manager.sh" "Secrets Manager Setup"
run_validation "check-database-schema.sh" "Database Schema & Seed Data"

# Summary
echo ""
echo "📊 Validation Summary"
echo "===================="
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All validations passed!${NC}"
    echo -e "${GREEN}✅ Local development environment is ready${NC}"
    echo ""
    echo "🚀 Your environment is ready for development:"
    echo "   • MySQL: localhost:30306"
    echo "   • PostgreSQL: localhost:30432" 
    echo "   • LocalStack: localhost:30568"
    echo "   • Config files: ./config/shared/ and ./config/app/"
    echo ""
    echo "💡 Next steps:"
    echo "   • Run batch processing jobs"
    echo "   • Test your applications locally"
    echo "   • Use ./scripts/validation/local-validate.sh anytime to re-check"
    exit 0
else
    echo ""
    echo -e "${RED}❌ $FAILED_TESTS validation(s) failed${NC}"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   • Check individual script output for details"
    echo "   • Ensure local-up.sh completed successfully"
    echo "   • Verify all services are running: kubectl get pods -A"
    echo ""
    echo "💡 Common fixes:"
    echo "   • Re-run: ./scripts/infrastructure/local-down.sh && ./scripts/infrastructure/local-up.sh"
    echo "   • Check NodePort access: kubectl get svc -A"
    exit 1
fi
