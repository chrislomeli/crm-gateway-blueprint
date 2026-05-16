#!/bin/bash
set -e

echo "🔍 Checking Pipeline SQS queues in AWS..."

# Configuration
AWS_REGION=${AWS_REGION:-"us-west-2"}
AWS_PROFILE=${AWS_PROFILE:-"default"}

echo "📍 AWS region: $AWS_REGION"
echo "👤 AWS profile: $AWS_PROFILE"

# Verify AWS credentials
echo ""
echo "🔐 Verifying AWS credentials..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "❌ AWS credentials not configured or invalid"
    echo "   Please run: aws configure --profile $AWS_PROFILE"
    exit 1
fi

CALLER_IDENTITY=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --output json)
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
USER_ARN=$(echo "$CALLER_IDENTITY" | jq -r '.Arn')

echo "✅ Connected to AWS"
echo "   Account: $ACCOUNT_ID"
echo "   Identity: $USER_ARN"

# Our 3 pipeline queues
PIPELINE_QUEUES=(
    "aio-webhook-single"
    "aio-intent-queue"
    "aio-webhook-import"
)

echo ""
echo "📊 Pipeline Queue Status:"

for queue_name in "${PIPELINE_QUEUES[@]}"; do
    echo ""
    echo "   📬 $queue_name"
    
    # Try to get queue URL
    queue_url=$(aws sqs get-queue-url \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --queue-name "$queue_name" \
        --query 'QueueUrl' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$queue_url" = "NOT_FOUND" ]; then
        echo "      ❌ Queue not found"
        continue
    fi
    
    # Get queue attributes
    attributes=$(aws sqs get-queue-attributes \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --queue-url "$queue_url" \
        --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible VisibilityTimeout \
        --output json 2>/dev/null || echo '{"Attributes":{}}')
    
    message_count=$(echo "$attributes" | jq -r '.Attributes.ApproximateNumberOfMessages // "0"')
    in_flight_count=$(echo "$attributes" | jq -r '.Attributes.ApproximateNumberOfMessagesNotVisible // "0"')
    visibility_timeout=$(echo "$attributes" | jq -r '.Attributes.VisibilityTimeout // "30"')
    
    echo "      ✅ Available"
    echo "      Messages: $message_count"
    echo "      In-flight: $in_flight_count"
    echo "      Visibility timeout: ${visibility_timeout}s"
    
    # Show message preview if messages exist
    if [ "$message_count" -gt 0 ]; then
        echo "      🔍 Recent message preview:"
        recent_message=$(aws sqs receive-message \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --queue-url "$queue_url" \
            --max-number-of-messages 1 \
            --visibility-timeout-seconds 1 \
            --query 'Messages[0].Body' \
            --output text 2>/dev/null || echo "Unable to preview")
        
        if [ "$recent_message" != "Unable to preview" ] && [ "$recent_message" != "None" ]; then
            # Show first 100 characters of message
            preview=$(echo "$recent_message" | cut -c1-100)
            echo "         $preview..."
        else
            echo "         No messages retrieved"
        fi
    fi
done

echo ""
echo "🎯 Pipeline Queue Summary:"
echo "   Region: $AWS_REGION"
echo "   Account: $ACCOUNT_ID"
echo "   Pipeline queues checked: ${#PIPELINE_QUEUES[@]}"

# Quick validation - check if our main pipeline queues exist
main_queues_found=0
for queue_name in "aio-webhook-single" "aio-intent-queue"; do
    queue_url=$(aws sqs get-queue-url \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --queue-name "$queue_name" \
        --query 'QueueUrl' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$queue_url" != "NOT_FOUND" ]; then
        main_queues_found=$((main_queues_found + 1))
    fi
done

if [ $main_queues_found -eq 2 ]; then
    echo "✅ Core pipeline queues (aio-webhook-single, aio-intent-queue) are ready"
    exit 0
else
    echo "❌ Missing core pipeline queues - check AWS setup"
    exit 1
fi
