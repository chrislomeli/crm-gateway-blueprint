#!/bin/bash
set -e

# Common utility to wait for LocalStack services to be ready
# Uses practical AWS CLI tests instead of unreliable health endpoint

LOCALSTACK_ENDPOINT=${AWS_ENDPOINT:-"http://localhost:30568"}
AWS_REGION=${AWS_REGION:-"us-west-2"}
TIMEOUT=${TIMEOUT:-60}  # Reduced to 1 minute - more practical

echo "⏳ Waiting for LocalStack to be ready at $LOCALSTACK_ENDPOINT..."

# Function to test SQS service with actual AWS CLI
test_sqs() {
    aws sqs list-queues \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$AWS_REGION" \
        --output text >/dev/null 2>&1
}

# Function to test Secrets Manager service with actual AWS CLI  
test_secretsmanager() {
    aws secretsmanager list-secrets \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$AWS_REGION" \
        --output text >/dev/null 2>&1
}

# Function to test S3 service with actual AWS CLI
test_s3() {
    aws s3 ls \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$AWS_REGION" >/dev/null 2>&1
}

start_time=$(date +%s)

# Test core services with practical AWS CLI calls
echo "   Testing SQS service..."
while ! test_sqs; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    if [ $elapsed -gt $TIMEOUT ]; then
        echo "❌ Timeout waiting for LocalStack SQS service after ${TIMEOUT}s"
        echo "💡 LocalStack may still be starting up. Try running individual tests."
        exit 1
    fi
    
    echo "   Waiting for SQS... (${elapsed}s elapsed)"
    sleep 3
done
echo "   ✅ SQS service is ready"

echo "   Testing Secrets Manager service..."
if test_secretsmanager; then
    echo "   ✅ Secrets Manager service is ready"
else
    echo "   ⚠️  Secrets Manager not ready, but continuing (may work anyway)"
fi

echo "   Testing S3 service..."
if test_s3; then
    echo "   ✅ S3 service is ready"
else
    echo "   ⚠️  S3 not ready, but continuing (may work anyway)"
fi

echo "✅ LocalStack core services are ready for batch processing!"
exit 0
