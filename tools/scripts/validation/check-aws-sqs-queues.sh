#!/bin/bash
set -e

echo "🔍 Checking SQS queues in AWS..."

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

# Expected queues from our batch processing configuration
# Note: These should match your actual production queue names
EXPECTED_QUEUES=(
    "hubspot-webhook-single-queue"
    "hubspot-webhook-import-queue"
    "hubspot-intent-queue"
    "aio-webhook-single"
    "aio-intent-queue"
)

echo ""
echo "📬 Listing all SQS queues..."

# Get list of queues
QUEUE_LIST=$(aws sqs list-queues \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --query 'QueueUrls' \
    --output text \
    --no-paginate 2>/dev/null || echo "")

if [ -z "$QUEUE_LIST" ]; then
    echo "❌ No queues found in AWS region $AWS_REGION"
    echo "   This could mean:"
    echo "   - No queues exist in this region"
    echo "   - Insufficient permissions to list queues"
    echo "   - Wrong region specified"
    exit 1
fi

echo "✅ Found queues:"
echo "$QUEUE_LIST" | tr '\t' '\n' | sed 's/^/   /'

# Check for expected queues
echo ""
echo "🎯 Validating expected queues exist..."
missing_queues=0
found_queues=()

for expected_queue in "${EXPECTED_QUEUES[@]}"; do
    if echo "$QUEUE_LIST" | grep -q "$expected_queue"; then
        echo "   ✅ $expected_queue"
        found_queues+=("$expected_queue")
    else
        echo "   ❌ $expected_queue (missing)"
        missing_queues=$((missing_queues + 1))
    fi
done

# Show message counts and details for existing queues
echo ""
echo "📊 Queue details and message counts..."
echo "$QUEUE_LIST" | tr '\t' '\n' | while read -r queue_url; do
    if [ -n "$queue_url" ]; then
        queue_name=$(basename "$queue_url")
        
        # Get queue attributes
        attributes=$(aws sqs get-queue-attributes \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --queue-url "$queue_url" \
            --attribute-names All \
            --output json \
            --no-paginate 2>/dev/null || echo '{"Attributes":{}}')
        
        message_count=$(echo "$attributes" | jq -r '.Attributes.ApproximateNumberOfMessages // "0"')
        dlq_count=$(echo "$attributes" | jq -r '.Attributes.ApproximateNumberOfMessagesNotVisible // "0"')
        created_timestamp=$(echo "$attributes" | jq -r '.Attributes.CreatedTimestamp // "0"')
        visibility_timeout=$(echo "$attributes" | jq -r '.Attributes.VisibilityTimeout // "30"')
        max_receive_count=$(echo "$attributes" | jq -r '.Attributes.RedrivePolicy // "{}" | fromjson.maxReceiveCount // "N/A"' 2>/dev/null || echo "N/A")
        
        # Convert timestamp to readable date
        if [ "$created_timestamp" != "0" ] && [ "$created_timestamp" != "null" ]; then
            created_date=$(date -r "$created_timestamp" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "Unknown")
        else
            created_date="Unknown"
        fi
        
        echo ""
        echo "   📬 $queue_name"
        echo "      Messages: $message_count"
        echo "      In-flight: $dlq_count"
        echo "      Visibility timeout: ${visibility_timeout}s"
        echo "      Max receive count: $max_receive_count"
        echo "      Created: $created_date"
        
        # Show recent messages if any exist (peek without consuming)
        if [ "$message_count" -gt 0 ]; then
            echo "      🔍 Peeking at recent messages..."
            recent_messages=$(aws sqs receive-message \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --queue-url "$queue_url" \
                --max-number-of-messages 3 \
                --visibility-timeout-seconds 1 \
                --output json \
                --no-paginate 2>/dev/null || echo '{"Messages":[]}')
            
            message_previews=$(echo "$recent_messages" | jq -r '.Messages[]? | "         - " + (.Body | fromjson | tostring | .[0:100]) + "..."' 2>/dev/null || echo "         - Unable to preview messages")
            if [ -n "$message_previews" ]; then
                echo "$message_previews"
            else
                echo "         - No messages retrieved"
            fi
        fi
    fi
done

# Show queue permissions (useful for debugging access issues)
echo ""
echo "🔒 Checking queue permissions for found queues..."
for expected_queue in "${found_queues[@]}"; do
    queue_url=$(echo "$QUEUE_LIST" | tr '\t' '\n' | grep "$expected_queue" | head -1)
    if [ -n "$queue_url" ]; then
        echo ""
        echo "   🔐 $expected_queue permissions:"
        
        # Try to get queue policy
        policy=$(aws sqs get-queue-attributes \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --queue-url "$queue_url" \
            --attribute-names Policy \
            --query 'Attributes.Policy' \
            --output text \
            --no-paginate 2>/dev/null || echo "None")
        
        if [ "$policy" = "None" ] || [ "$policy" = "null" ]; then
            echo "      ✅ No explicit policy (uses default permissions)"
        else
            echo "      📋 Has custom policy:"
            echo "$policy" | jq '.' 2>/dev/null | sed 's/^/         /' || echo "         $policy"
        fi
    fi
done

echo ""
echo "🎯 AWS SQS Queue Check Summary:"
echo "   Region: $AWS_REGION"
echo "   Account: $ACCOUNT_ID"
echo "   Total queues found: $(echo "$QUEUE_LIST" | tr '\t' '\n' | wc -l | tr -d ' ')"
echo "   Expected queues found: $((${#EXPECTED_QUEUES[@]} - missing_queues))/${#EXPECTED_QUEUES[@]}"

if [ $missing_queues -eq 0 ]; then
    echo "✅ All expected queues are present in AWS"
    exit 0
else
    echo "❌ $missing_queues expected queues are missing from AWS"
    echo ""
    echo "💡 Troubleshooting tips:"
    echo "   - Verify queue names match your production configuration"
    echo "   - Check if queues exist in a different AWS region"
    echo "   - Ensure your AWS credentials have SQS permissions"
    echo "   - Confirm queues haven't been deleted or renamed"
    exit 1
fi
