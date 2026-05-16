#!/bin/bash
# setup.localstack.sh
# Initialize LocalStack with SQS queues and S3 buckets
set -e

echo "🪣 Setting up LocalStack resources (SQS queues and S3 buckets)..."

# Wait for LocalStack to be ready
echo "   Waiting for LocalStack to be available..."
timeout=60
while ! curl -s http://localhost:30566/_localstack/health >/dev/null 2>&1; do
    if [ $timeout -le 0 ]; then
        echo "   ❌ LocalStack not ready after 60 seconds"
        exit 1
    fi
    echo "   ⏳ Waiting for LocalStack... ($timeout seconds remaining)"
    sleep 2
    timeout=$((timeout - 2))
done

echo "   ✅ LocalStack is ready"

# Create SQS queues and S3 buckets via kubectl exec
echo "   Creating SQS queues and S3 buckets..."
kubectl exec deployment/localstack -- sh -c '
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_DEFAULT_REGION=us-west-2

    echo "Creating SQS queues..."
    for queue in batch-import batch-processing file-discovery notifications dead-letter; do
        echo "  - Creating queue: $queue"
        awslocal sqs create-queue --queue-name $queue >/dev/null 2>&1 || echo "    Queue $queue may already exist"
    done

    echo "Creating S3 buckets..."
    for bucket in acme-crm-local batch-files-local processed-files-local reports-local; do
        echo "  - Creating bucket: $bucket"
        awslocal s3 mb s3://$bucket >/dev/null 2>&1 || echo "    Bucket $bucket may already exist"
    done

    echo "LocalStack resources created successfully"
' || {
    echo "   ❌ Failed to create LocalStack resources via kubectl exec"
    echo "   Trying direct AWS CLI approach..."
    
    # Fallback: direct AWS CLI calls
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_DEFAULT_REGION=us-west-2
    
    echo "   Creating SQS queues..."
    for queue in batch-import batch-processing file-discovery notifications dead-letter; do
        aws --endpoint-url=http://localhost:30566 sqs create-queue --queue-name $queue >/dev/null 2>&1 || echo "    Queue $queue may already exist"
    done
    
    echo "   Creating S3 buckets..."
    for bucket in acme-crm-local batch-files-local processed-files-local reports-local; do
        aws --endpoint-url=http://localhost:30566 s3 mb s3://$bucket >/dev/null 2>&1 || echo "    Bucket $bucket may already exist"
    done
}

echo ""
echo "📊 Verifying LocalStack resources..."

# Verify queues were created
echo "   SQS Queues:"
aws --endpoint-url=http://localhost:30566 sqs list-queues 2>/dev/null | grep -o '"[^"]*batch[^"]*"' || echo "   ⚠️ Could not list queues"

# Verify buckets were created  
echo "   S3 Buckets:"
aws --endpoint-url=http://localhost:30566 s3 ls 2>/dev/null || echo "   ⚠️ Could not list buckets"

echo ""
echo "✅ LocalStack setup complete!"
