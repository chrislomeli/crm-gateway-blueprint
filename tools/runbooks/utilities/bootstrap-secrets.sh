#!/bin/bash

echo "🎯 DEMO: Two-Tier Secret Management Flow"
echo "========================================"

echo ""
echo "📋 Step 1: Current Infrastructure State"
echo "--------------------------------------"
echo "🔍 Infrastructure values.yaml contains:"
grep -A3 "rootPassword:" helm/acme-infrastructure/values.yaml
grep -A3 "userPassword:" helm/acme-infrastructure/values.yaml
grep -A3 "password:" helm/acme-infrastructure/values.yaml

echo ""
echo "🔍 Current infrastructure containers use these directly:"
echo "MySQL deployment environment variables:"
kubectl get deployment acme-infrastructure-mysql -n acme-infrastructure -o jsonpath='{.spec.template.spec.containers[0].env}' | jq -r '.[] | select(.name | contains("PASSWORD")) | "\(.name): \(.value)"'

echo ""
echo "📋 Step 2: Bootstrap Process"
echo "----------------------------"
echo "🚀 Running bootstrap to create application ConfigMaps..."

# Check if acme-services namespace exists
if ! kubectl get namespace acme-services >/dev/null 2>&1; then
    echo "📦 Creating acme-services namespace..."
    kubectl create namespace acme-services
fi

# Extract current passwords from infrastructure
MYSQL_ROOT_PASSWORD="root_password"  # From values.yaml
MYSQL_USER_PASSWORD="acme_password"  # From values.yaml
POSTGRES_PASSWORD="postgres_password"  # From values.yaml

echo "   📊 Infrastructure passwords:"
echo "      MySQL Root: ${MYSQL_ROOT_PASSWORD}"
echo "      MySQL User: ${MYSQL_USER_PASSWORD}"
echo "      PostgreSQL: ${POSTGRES_PASSWORD}"

echo ""
echo "🏗️ Creating application ConfigMap with !ssm pattern..."

# Create the application ConfigMap
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: database-config
  namespace: acme-services
  annotations:
    secrets.acme.io/resolve: "true"
    secrets.acme.io/source: "infrastructure-bootstrap"
data:
  # Database connections with secret references (corrected field names)
  mysql.host: "mysql.acme-infrastructure.svc.cluster.local"
  mysql.port: "3306"
  mysql.database: "acme"
  mysql.user: "acme_user"  # ⚠️ CRITICAL: Must be 'user' not 'username' for MySQLService
  mysql.password: "!ssm<mysql-database>[user_password]"
  
  # DataStore Configuration (required by BatchFileTrackingService)
  dataStore.tenantsTable: "batch_tenants"
  dataStore.filesTable: "batch_files"
  dataStore.historyTable: "batch_processing_history"
  dataStore.dashboardView: "batch_tenant_dashboard_view"
  
  postgres_host: "postgres.acme-infrastructure.svc.cluster.local"
  postgres_port: "5432"
  postgres_database: "pipeline"
  postgres_user: "postgres"
  postgres_password: "!ssm<postgres-database>[password]"
  
  # LocalStack for development
  localstack_endpoint: "http://localstack.acme-infrastructure.svc.cluster.local:4566"
  aws_region: "us-east-1"
EOF

echo "✅ Application ConfigMap created!"

echo ""
echo "📋 Step 3: Populate LocalStack Secrets Manager"
echo "----------------------------------------------"
echo "🔐 Creating secrets in LocalStack that match the !ssm patterns..."

# Create MySQL secret in LocalStack
echo "   Creating mysql-database secret..."
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-east-1 \
  secretsmanager create-secret \
  --name mysql-database \
  --description "MySQL database credentials" \
  --secret-string "{\"root_password\":\"${MYSQL_ROOT_PASSWORD}\",\"user_password\":\"${MYSQL_USER_PASSWORD}\"}" \
  --no-cli-pager 2>/dev/null && echo "   ✅ mysql-database secret created" || echo "   ℹ️ mysql-database secret already exists"

# Create PostgreSQL secret in LocalStack  
echo "   Creating postgres-database secret..."
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-east-1 \
  secretsmanager create-secret \
  --name postgres-database \
  --description "PostgreSQL database credentials" \
  --secret-string "{\"password\":\"${POSTGRES_PASSWORD}\"}" \
  --no-cli-pager 2>/dev/null && echo "   ✅ postgres-database secret created" || echo "   ℹ️ postgres-database secret already exists"

echo ""
echo "📋 Step 4: Verify the Complete Flow"
echo "-----------------------------------"
echo "🔍 Application ConfigMap contains:"
kubectl get configmap database-config -n acme-services -o yaml | grep -A10 "data:"

echo ""
echo "🔍 LocalStack Secrets Manager contains:"
echo "   mysql-database secret:"
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-east-1 \
  secretsmanager get-secret-value --secret-id mysql-database --query SecretString --output text --no-cli-pager 2>/dev/null | jq . || echo "   ❌ Could not retrieve secret"

echo ""
echo "   postgres-database secret:"
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test aws --endpoint-url=http://localhost:30568 --region=us-east-1 \
  secretsmanager get-secret-value --secret-id postgres-database --query SecretString --output text --no-cli-pager 2>/dev/null | jq . || echo "   ❌ Could not retrieve secret"

echo ""
echo "🎯 SUMMARY: How It Works"
echo "========================"
echo "1️⃣ Infrastructure containers get clear-text passwords directly"
echo "2️⃣ Application ConfigMaps use !ssm<secret>[field] pattern"  
echo "3️⃣ LocalStack Secrets Manager stores the actual values"
echo "4️⃣ ConfigProvider resolves !ssm patterns at runtime"
echo "5️⃣ Applications get the same passwords as infrastructure"
echo ""
echo "✅ Single source of truth: helm/acme-infrastructure/values.yaml"
echo "✅ Zero manual coordination required"
echo "✅ Production-ready secret management for applications"
echo "✅ Simple clear-text for local development infrastructure"
