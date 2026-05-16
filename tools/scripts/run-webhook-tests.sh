#!/bin/bash
set -e

echo "🚀 Webhook Test Harness"
echo "======================"

# Check if LocalStack is running
echo "🔍 Checking LocalStack connectivity..."
if ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
    echo "❌ LocalStack is not running at http://localhost:4566"
    echo "💡 Start LocalStack first: docker run --rm -it -p 4566:4566 localstack/localstack"
    exit 1
fi

echo "✅ LocalStack is running"

# Set environment for LocalStack
export NODE_ENV=local
export AWS_REGION=us-west-2

# Navigate to project root
cd "$(dirname "$0")/../.."

echo "🧪 Running webhook test harness..."
echo "📁 Working directory: $(pwd)"

# Build and run the test harness
pnpm build --filter=@platform/infrastructure --filter=@platform/services --filter=@platform/configuration --filter=@platform/core --filter=@crm/hubspot

# Run the test harness using tsx for TypeScript execution
npx tsx tools/scripts/webhook-test-harness.ts

echo "🏁 Test completed!"
