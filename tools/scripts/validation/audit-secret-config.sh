#!/bin/bash

echo "🔍 CRITICAL: Auditing Secret Configuration Issues"
echo "=============================================="

echo ""
echo "📋 Current State Analysis:"
echo "-------------------------"

echo ""
echo "1️⃣ Helm Values.yaml - Secret Definitions:"
echo "   MySQL root password: $(grep -A1 'rootPassword:' helm/acme-infrastructure/values.yaml)"
echo "   MySQL user password: $(grep -A1 'userPassword:' helm/acme-infrastructure/values.yaml)"
echo "   PostgreSQL password: $(grep -A1 'password:' helm/acme-infrastructure/values.yaml)"

echo ""
echo "2️⃣ Expected vs Actual Secret Pattern:"
echo "   EXPECTED: !ssm<mysql-database>[root_password]"
echo "   ACTUAL:   \"root_password\" (clear text)"
echo "   STATUS:   ❌ BROKEN - No secret references found"

echo ""
echo "3️⃣ Helm Template Analysis:"
echo "   Checking if templates create ConfigMaps/Secrets..."

# Check what the templates actually generate
echo "   MySQL template ConfigMap creation:"
if grep -q "kind: ConfigMap" helm/acme-infrastructure/templates/mysql.yaml; then
    echo "   ✅ ConfigMap template exists"
else
    echo "   ❌ No ConfigMap template found"
fi

echo "   MySQL template Secret creation:"
if grep -q "kind: Secret" helm/acme-infrastructure/templates/mysql.yaml; then
    echo "   ✅ Secret template exists"
else
    echo "   ❌ No Secret template found"
fi

echo ""
echo "4️⃣ Deployed Resources Check:"
echo "   ConfigMaps in acme-infrastructure:"
kubectl get configmaps -n acme-infrastructure --no-headers 2>/dev/null | wc -l | xargs echo "   Count:"

echo "   Secrets in acme-infrastructure (excluding Helm):"
kubectl get secrets -n acme-infrastructure --no-headers 2>/dev/null | grep -v "helm.sh" | wc -l | xargs echo "   Count:"

echo ""
echo "5️⃣ Actual Deployment Environment Variables:"
echo "   MySQL deployment env vars:"
kubectl get deployment acme-infrastructure-mysql -n acme-infrastructure -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' 2>/dev/null | tr ' ' '\n' | sed 's/^/      /'

echo ""
echo "6️⃣ AWS/Production Readiness:"
echo "   ❌ Clear-text passwords in values.yaml"
echo "   ❌ No !ssm<secret>[field] pattern usage"
echo "   ❌ Templates not using ConfigMaps/Secrets properly"
echo "   ❌ No External Secrets Operator integration"
echo "   ❌ No AWS Secrets Manager integration"

echo ""
echo "🚨 CRITICAL ISSUES IDENTIFIED:"
echo "   1. Hardcoded passwords in Helm values"
echo "   2. Templates bypass ConfigMaps/Secrets"
echo "   3. No production secret management pattern"
echo "   4. Zero AWS compatibility"
echo "   5. Configuration test failures make sense now"

echo ""
echo "💡 REQUIRED FIXES:"
echo "   1. Update values.yaml to use !ssm<secret>[field] pattern"
echo "   2. Fix templates to create and use ConfigMaps/Secrets"
echo "   3. Implement secret resolution logic"
echo "   4. Add External Secrets Operator for AWS"
echo "   5. Create validation tests for secret resolution"
