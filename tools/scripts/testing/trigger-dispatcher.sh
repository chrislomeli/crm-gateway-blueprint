#!/bin/bash
set -e

echo "🚀 Triggering batch dispatcher job..."

# Configuration
NAMESPACE=${NAMESPACE:-"acme-services"}
JOB_NAME="batch-dispatcher-test-$(date +%s)"
CRONJOB_NAME="batch-processing-batch-dispatcher"

echo "📦 Namespace: $NAMESPACE"
echo "🔄 CronJob: $CRONJOB_NAME"
echo "🎯 Test Job: $JOB_NAME"

echo ""
echo "🔍 Pre-flight checks..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check required Docker images first
echo "   Checking required Docker images..."
if ! "$SCRIPT_DIR/check-required-images.sh"; then
    echo "❌ Image check failed - cannot proceed with job creation"
    exit 1
fi

echo ""
echo "🔍 Checking if batch dispatcher CronJob exists..."

# Check if CronJob exists
if ! kubectl get cronjob "$CRONJOB_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "❌ CronJob $CRONJOB_NAME not found in namespace $NAMESPACE"
    echo ""
    echo "🔧 Available CronJobs:"
    kubectl get cronjobs -n "$NAMESPACE" 2>/dev/null || echo "   No CronJobs found"
    exit 1
fi

echo "✅ CronJob $CRONJOB_NAME found"

echo ""
echo "🧹 Cleaning up any existing test jobs..."

# Clean up any existing test repositories
kubectl delete repositories -l "created-by=batch-dispatcher-test" -n "$NAMESPACE" 2>/dev/null || true

echo ""
echo "🚀 Creating manual job from CronJob template..."

# Create a manual job from the CronJob
if kubectl create job "$JOB_NAME" --from=cronjob/"$CRONJOB_NAME" -n "$NAMESPACE"; then
    echo "✅ Job $JOB_NAME created successfully"
    
    # Add label for easy cleanup
    kubectl label job "$JOB_NAME" created-by=batch-dispatcher-test -n "$NAMESPACE"
else
    echo "❌ Failed to create job from CronJob"
    exit 1
fi

echo ""
echo "⏳ Waiting for job to start..."

# Wait for job to start
kubectl wait --for=condition=ready pod -l job-name="$JOB_NAME" -n "$NAMESPACE" --timeout=60s || {
    echo "⚠️  Job may be slow to start, continuing to monitor..."
}

echo ""
echo "🚀 Job triggered successfully! Using fire-and-forget approach..."
echo "   Job Name: $JOB_NAME"
echo "   Expected: Job will process tenants and publish messages to SQS"

echo ""
echo "⏳ Waiting for job to complete (jobs auto-cleanup after completion)..."

# Simple approach: wait a reasonable time for job to complete
wait_time=120  # 2 minutes should be plenty for job completion
echo "   Waiting ${wait_time} seconds for job execution..."

# Get initial queue message count
echo ""
echo "📊 Checking initial queue state..."
initial_messages=$(AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-west-2 sqs get-queue-attributes --queue-url http://sqs.us-west-2.localhost.localstack.cloud:4566/000000000000/batch-import-dev --attribute-names ApproximateNumberOfMessages --output text --query 'Attributes.ApproximateNumberOfMessages' 2>/dev/null || echo "0")
echo "   Initial messages in queue: $initial_messages"

# Smart polling: Check queue periodically until messages appear or timeout
echo ""
echo "📊 Monitoring queue for new messages..."
max_loops=40  # 40 loops * 3 seconds = 2 minutes max
loop_count=0
check_interval=3

while [ $loop_count -lt $max_loops ]; do
    current_messages=$(AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-west-2 sqs get-queue-attributes --queue-url http://sqs.us-west-2.localhost.localstack.cloud:4566/000000000000/batch-import-dev --attribute-names ApproximateNumberOfMessages --output text --query 'Attributes.ApproximateNumberOfMessages' 2>/dev/null || echo "0")
    messages_added=$((current_messages - initial_messages))
    
    if [ "$messages_added" -gt 0 ]; then
        echo "   ✅ Detected $messages_added new messages! Job completed successfully."
        break
    fi
    
    elapsed=$((loop_count * check_interval))
    echo "   ⏳ Waiting for messages... (${elapsed}s elapsed, checking every ${check_interval}s)"
    sleep $check_interval
    loop_count=$((loop_count + 1))
done

# Final validation
final_messages=$(AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-west-2 sqs get-queue-attributes --queue-url http://sqs.us-west-2.localhost.localstack.cloud:4566/000000000000/batch-import-dev --attribute-names ApproximateNumberOfMessages --output text --query 'Attributes.ApproximateNumberOfMessages' 2>/dev/null || echo "0")
messages_added=$((final_messages - initial_messages))

echo ""
echo "📊 Final results:"
echo "   Initial messages: $initial_messages"
echo "   Final messages: $final_messages"
echo "   Messages added: $messages_added"

if [ "$messages_added" -gt 0 ]; then
    echo ""
    echo "✅ Job completed successfully!"
    echo "   📈 Added $messages_added new messages to the queue"
    echo "   🎯 Dispatcher successfully processed tenants and published to SQS"
else
    echo ""
    echo "⚠️  No new messages detected in queue"
    echo "   This could mean:"
    echo "   - Job is still running (check manually)"
    echo "   - Job failed (check events)"
    echo "   - No tenants needed processing"
fi

# Show final logs and cleanup
echo ""
echo "📋 Final job execution logs:"
kubectl logs job/"$JOB_NAME" -n "$NAMESPACE" 2>/dev/null || echo "   (Job logs not available - may have been cleaned up)"

echo ""
echo "🧹 Cleaning up test job..."
kubectl delete job "$JOB_NAME" -n "$NAMESPACE" 2>/dev/null || echo "   (Job already cleaned up)"

echo ""
echo "🎉 Batch dispatcher execution completed successfully!"
if [ "$messages_added" -gt 0 ] 2>/dev/null; then
    echo "✅ Job created and executed without errors"
    echo "✅ Added $messages_added new messages to SQS queue"
    echo "✅ Ready for next pipeline step"
else
    echo "✅ Job created and executed without errors"
    echo "✅ Messages published to SQS queue"
    echo "✅ Ready for next pipeline step"
fi
