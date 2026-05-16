#!/bin/bash

# Workflow: Test Batch Processing Pipeline
# End-to-end validation of the batch processing system

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILITIES_DIR="$SCRIPT_DIR/../utilities"

echo "🎯 Batch Pipeline Testing Workflow"
echo "=================================="

echo ""
echo "📋 Step 1: Check Infrastructure Prerequisites"
echo "--------------------------------------------"
$UTILITIES_DIR/check-pods.sh

echo ""
echo "📋 Step 2: Check SQS Queues"
echo "---------------------------"
if [ -f "$SCRIPT_DIR/../batch-processing/check-sqs-queues.sh" ]; then
    $SCRIPT_DIR/../batch-processing/check-sqs-queues.sh
else
    echo "   ℹ️ SQS queue check not available"
fi

echo ""
echo "📋 Step 3: Initialize MySQL Database (if needed)"
echo "------------------------------------------------"
echo "   🔍 Checking if MySQL batch tables exist..."
if kubectl exec deployment/acme-infrastructure-mysql -n acme-infrastructure -- \
   mysql -u acme_user -pacme_password -e "USE acme; SELECT COUNT(*) FROM batch_tenants LIMIT 1;" >/dev/null 2>&1; then
    echo "   ✅ MySQL batch tables already exist"
else
    echo "   🏗️ Initializing MySQL batch tables..."
    kubectl apply -f ../../k8s/mysql-batch-init.yaml
    kubectl wait --for=condition=complete --timeout=120s job/mysql-batch-init -n acme-services
    echo "   ✅ MySQL batch tables initialized"
fi

echo ""
echo "📋 Step 4: Trigger Batch Dispatcher"
echo "----------------------------------"
$UTILITIES_DIR/trigger-dispatcher.sh

echo ""
echo "📋 Step 5: Verify Queue Messages Published"
echo "------------------------------------------"
echo "   🔍 Checking if dispatcher published messages to queues..."
$UTILITIES_DIR/check-sqs-queues.sh

echo ""
echo "✅ Batch Pipeline Testing Complete!"
echo ""
echo "🎯 Summary:"
echo "   - Infrastructure verified"
echo "   - Queue system checked"
echo "   - Pipeline triggered and tested"
echo "   - Queue messages verified"
