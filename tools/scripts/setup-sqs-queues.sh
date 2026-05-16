#!/bin/bash
set -e

echo "🚀 Setting up SQS Queues for LocalStack"
echo "======================================"

# Check if LocalStack is running
echo "🔍 Checking LocalStack connectivity..."
if ! curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
    echo "❌ LocalStack is not running at http://localhost:4566"
    echo "💡 Please start LocalStack first"
    exit 1
fi

echo "✅ LocalStack is running"

# Set AWS credentials for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-west-2

ENDPOINT="http://localhost:4566"

echo "🏗️  Creating SQS queues..."

# Create the three required queues
QUEUES=(
    "hubspot-webhook-single-queue"
    "hubspot-webhook-import-queue" 
    "hubspot-intent-queue"
)

for queue in "${QUEUES[@]}"; do
    echo "📝 Creating queue: $queue"
    
    # Create queue with standard configuration
    aws --endpoint-url=$ENDPOINT sqs create-queue \
        --queue-name "$queue" \
        --attributes '{
            "VisibilityTimeoutSeconds": "300",
            "MessageRetentionPeriod": "1209600",
            "ReceiveMessageWaitTimeSeconds": "20"
        }' \
        --region us-west-2 > /dev/null
    
    echo "✅ Created: $queue"
done

echo ""
echo "🎉 All SQS queues created successfully!"
echo ""
echo "📋 Queue URLs:"
for queue in "${QUEUES[@]}"; do
    echo "   • $ENDPOINT/000000000000/$queue"
done

echo ""
echo "🔍 Verifying queues exist..."
aws --endpoint-url=$ENDPOINT sqs list-queues --region us-west-2
