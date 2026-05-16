#!/bin/bash
set -e

echo "🚀 Webhook Pipeline Test"
echo "======================="

# Check if LocalStack is running
echo "🔍 Checking LocalStack connectivity..."
if ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
    echo "❌ LocalStack is not running at http://localhost:4566"
    echo "💡 Start LocalStack first with the hybrid-setup.md runbook"
    exit 1
fi

echo "✅ LocalStack is running"

# Set environment for LocalStack
export NODE_ENV=local
export AWS_REGION=us-west-2

# Navigate to project root
cd "$(dirname "$0")/../.."

echo "🧪 Running webhook pipeline test..."
echo "📁 Working directory: $(pwd)"

# Run the test harness from the hubspot package (which has all the dependencies)
pnpm --filter=@crm/hubspot test:webhook-pipeline

echo "🏁 Test completed!"
