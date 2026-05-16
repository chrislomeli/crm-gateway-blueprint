#!/bin/bash

# Workflow: Complete Infrastructure Validation
# Orchestrates multiple utilities to validate the entire infrastructure stack

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILITIES_DIR="$SCRIPT_DIR/../utilities"

echo "🎯 Infrastructure Validation Workflow"
echo "===================================="

echo ""
echo "📋 Step 1: Check Pod Health"
echo "----------------------------"
$UTILITIES_DIR/check-pods.sh

echo ""
echo "📋 Step 2: Wait for LocalStack"
echo "------------------------------"
$UTILITIES_DIR/wait-for-localstack.sh

echo ""
echo "📋 Step 3: Test Database Connectivity"
echo "------------------------------------"
$UTILITIES_DIR/test-database-connectivity.sh all

echo ""
echo "📋 Step 4: Test LocalStack Connectivity"
echo "--------------------------------------"
$UTILITIES_DIR/test-localstack-connectivity.sh

echo ""
echo "✅ Infrastructure Validation Complete!"
echo ""
echo "🎯 Summary:"
echo "   - All pods are healthy"
echo "   - Database connections working"
echo "   - LocalStack services available"
echo "   - Infrastructure ready for applications"
