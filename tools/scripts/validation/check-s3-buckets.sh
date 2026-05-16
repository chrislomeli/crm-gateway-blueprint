#!/bin/bash
set -e

echo "🪣 Checking S3 buckets in LocalStack..."

# Configuration
LOCALSTACK_ENDPOINT=${AWS_ENDPOINT:-"http://localhost:30568"}
AWS_REGION="us-west-2"
BUCKET_NAME="acme-exports-local"
BUCKET_PREFIX="exports/"

echo "📍 LocalStack endpoint: $LOCALSTACK_ENDPOINT"
echo "🌍 AWS region: $AWS_REGION"
echo "🪣 Expected bucket: $BUCKET_NAME"

echo ""
echo "📋 Listing all S3 buckets..."

# Get list of buckets
BUCKET_LIST=$(aws s3api list-buckets \
    --endpoint-url "$LOCALSTACK_ENDPOINT" \
    --region "$AWS_REGION" \
    --query 'Buckets[].Name' \
    --output text \
    --no-paginate 2>/dev/null || echo "")

if [ -z "$BUCKET_LIST" ]; then
    echo "❌ No buckets found in LocalStack"
    exit 1
fi

echo "✅ Found buckets:"
echo "$BUCKET_LIST" | tr '\t' '\n' | sed 's/^/   /'

# Check if expected bucket exists
echo ""
echo "🎯 Validating expected bucket exists..."
if echo "$BUCKET_LIST" | grep -q "$BUCKET_NAME"; then
    echo "   ✅ $BUCKET_NAME"
    
    # Check if README.md exists in the bucket
    echo ""
    echo "📄 Checking for README.md in bucket..."
    if aws s3api head-object \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$AWS_REGION" \
        --bucket "$BUCKET_NAME" \
        --key "${BUCKET_PREFIX}README.md" >/dev/null 2>&1; then
        echo "   ✅ README.md found in ${BUCKET_PREFIX}"
        
        # Show README content
        echo ""
        echo "📖 README.md content:"
        aws s3api get-object \
            --endpoint-url "$LOCALSTACK_ENDPOINT" \
            --region "$AWS_REGION" \
            --bucket "$BUCKET_NAME" \
            --key "${BUCKET_PREFIX}README.md" \
            /tmp/readme.md >/dev/null 2>&1
        cat /tmp/readme.md | sed 's/^/   /'
        rm -f /tmp/readme.md
    else
        echo "   ❌ README.md not found in ${BUCKET_PREFIX}"
    fi
    
    # List objects in bucket
    echo ""
    echo "📁 Objects in bucket:"
    OBJECT_LIST=$(aws s3api list-objects-v2 \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$AWS_REGION" \
        --bucket "$BUCKET_NAME" \
        --query 'Contents[].Key' \
        --output text \
        --no-paginate 2>/dev/null || echo "")
    
    if [ -n "$OBJECT_LIST" ]; then
        echo "$OBJECT_LIST" | tr '\t' '\n' | sed 's/^/   /'
    else
        echo "   (empty)"
    fi
    
    bucket_status="PASS"
else
    echo "   ❌ $BUCKET_NAME (missing)"
    bucket_status="FAIL"
fi

echo ""
echo "🎯 S3 Bucket Check Summary:"
if [ "$bucket_status" = "PASS" ]; then
    echo "✅ S3 bucket validation passed"
    exit 0
else
    echo "❌ S3 bucket validation failed"
    echo "💡 Run initialization to create missing resources"
    exit 1
fi
