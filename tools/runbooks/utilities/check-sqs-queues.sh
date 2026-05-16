#!/bin/bash
set -e

echo "🔍 Checking SQS queues in LocalStack..."

# Configuration
LOCALSTACK_ENDPOINT=${AWS_ENDPOINT:-"http://localhost:30568"}
AWS_REGION="us-west-2"  # Force the region where we created the queue

echo "📍 LocalStack endpoint: $LOCALSTACK_ENDPOINT"
echo "🌍 AWS region: $AWS_REGION"

# Expected queues from our batch processing configuration
EXPECTED_QUEUES=(
    "batch-import-dev"
)

echo ""
echo "📬 Listing all SQS queues..."

# Get list of queues
QUEUE_LIST=$(aws sqs list-queues \
    --endpoint-url "$LOCALSTACK_ENDPOINT" \
    --region "$AWS_REGION" \
    --query 'QueueUrls' \
    --output text \
    --no-paginate 2>/dev/null || echo "")

if [ -z "$QUEUE_LIST" ]; then
    echo "❌ No queues found in LocalStack"
    exit 1
fi

echo "✅ Found queues:"
echo "$QUEUE_LIST" | tr '\t' '\n' | sed 's/^/   /'

# Check for expected queues
echo ""
echo "🎯 Validating expected queues exist..."
missing_queues=0

for expected_queue in "${EXPECTED_QUEUES[@]}"; do
    if echo "$QUEUE_LIST" | grep -q "$expected_queue"; then
        echo "   ✅ $expected_queue"
    else
        echo "   ❌ $expected_queue (missing)"
        missing_queues=$((missing_queues + 1))
    fi
done

# Show message counts for existing queues
echo ""
echo "📊 Queue message counts..."
echo "$QUEUE_LIST" | tr '\t' '\n' | while read -r queue_url; do
    if [ -n "$queue_url" ]; then
        queue_name=$(basename "$queue_url")
        message_count=$(aws sqs get-queue-attributes \
            --endpoint-url "$LOCALSTACK_ENDPOINT" \
            --region "$AWS_REGION" \
            --queue-url "$queue_url" \
            --attribute-names ApproximateNumberOfMessages \
            --query 'Attributes.ApproximateNumberOfMessages' \
            --output text \
            --no-paginate 2>/dev/null || echo "0")
        echo "   📬 $queue_name: $message_count messages"
    fi
done

echo ""
echo "🎯 SQS Queue Check Summary:"
if [ $missing_queues -eq 0 ]; then
    echo "✅ All expected queues are present"
    exit 0
else
    echo "❌ $missing_queues expected queues are missing"
    exit 1
fi
