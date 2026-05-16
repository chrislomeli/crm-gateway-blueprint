#!/bin/bash

# Utility: Test LocalStack connectivity
# Usage: ./test-localstack-connectivity.sh

set -e

echo "☁️ Testing LocalStack connectivity..."

kubectl run localstack-test --rm -i --restart=Never --image=amazon/aws-cli:2.15.30 --env="AWS_ACCESS_KEY_ID=test" --env="AWS_SECRET_ACCESS_KEY=test" -- \
  aws --endpoint-url=http://localstack.acme-infrastructure.svc.cluster.local:4566 \
  --region=us-east-1 --no-cli-pager \
  sts get-caller-identity >/dev/null 2>&1 && echo "   ✅ LocalStack: Connected" || echo "   ❌ LocalStack: Failed"
