#!/bin/bash
set -e

echo "🔐 Checking Secrets Manager in LocalStack..."

# Configuration
LOCALSTACK_ENDPOINT=${AWS_ENDPOINT:-"http://localhost:30568"}
REGIONS=("us-west-1" "us-west-2" "us-east-1" "us-east-2")

echo "📍 LocalStack endpoint: $LOCALSTACK_ENDPOINT"
echo "🌍 Checking regions: ${REGIONS[*]}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check secrets in a region
check_region_secrets() {
    local region="$1"
    echo ""
    echo -e "${BLUE}🌍 Region: $region${NC}"
    echo "========================="
    
    # List secrets in this region
    local secrets_list
    secrets_list=$(aws secretsmanager list-secrets \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$region" \
        --query 'SecretList[].Name' \
        --output text \
        --no-paginate 2>/dev/null || echo "")
    
    if [ -z "$secrets_list" ]; then
        echo -e "   ${YELLOW}⚠️  No secrets found in $region${NC}"
        return 0
    fi
    
    echo -e "${GREEN}✅ Found secrets in $region:${NC}"
    echo "$secrets_list" | tr '\t' '\n' | sed 's/^/   /'
    
    # Get details for each secret and validate structure
    echo ""
    echo "📋 Secret Details & Validation:"
    echo "$secrets_list" | tr '\t' '\n' | while read -r secret_name; do
        if [ -n "$secret_name" ]; then
            echo ""
            echo -e "   ${BLUE}🔑 Secret: $secret_name${NC}"
            
            # Get secret metadata
            local secret_info
            secret_info=$(aws secretsmanager describe-secret \
                --endpoint-url "$LOCALSTACK_ENDPOINT" \
                --region "$region" \
                --secret-id "$secret_name" \
                --query '{Description:Description,CreatedDate:CreatedDate,LastChangedDate:LastChangedDate}' \
                --output table 2>/dev/null || echo "Could not get metadata")
            
            echo "$secret_info" | sed 's/^/      /'
            
            # Validate secret structure based on expected keys
            case "$secret_name" in
                "acme-db")
                    validate_secret_structure "$region" "$secret_name" "host,port,database,user,password"
                    ;;
                "crm-db")
                    validate_secret_structure "$region" "$secret_name" "host,port,database,user,password"
                    ;;
                "mysql-database")
                    validate_secret_structure "$region" "$secret_name" "hostname,port,database,username,password"
                    ;;
                "postgres-database")
                    validate_secret_structure "$region" "$secret_name" "hostname,port,database,username,password"
                    ;;
                "aws-credentials")
                    validate_secret_structure "$region" "$secret_name" "access_key_id,secret_access_key,region"
                    ;;
                *)
                    echo -e "      ${YELLOW}⚠️  Unknown secret type - no validation rules${NC}"
                    ;;
            esac
            
            # Get secret value (safely)
            echo ""
            echo "      📄 Secret Value:"
            local secret_value
            secret_value=$(aws secretsmanager get-secret-value \
                --endpoint-url "$LOCALSTACK_ENDPOINT" \
                --region "$region" \
                --secret-id "$secret_name" \
                --query 'SecretString' \
                --output text 2>/dev/null || echo "Could not retrieve value")
            
            if [ "$secret_value" != "Could not retrieve value" ]; then
                # Try to pretty-print JSON if it's JSON
                if echo "$secret_value" | jq . >/dev/null 2>&1; then
                    echo "$secret_value" | jq . | sed 's/^/         /'
                else
                    echo "         $secret_value"
                fi
            else
                echo "         ❌ Could not retrieve secret value"
            fi
        fi
    done
}

# Function to check LocalStack connectivity
check_localstack_connectivity() {
    echo "🔍 Testing LocalStack connectivity..."
    
    # Test basic connectivity
    if aws sts get-caller-identity \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "us-east-1" \
        --no-cli-pager >/dev/null 2>&1; then
        echo -e "${GREEN}✅ LocalStack is accessible${NC}"
        return 0
    else
        echo -e "${RED}❌ Cannot connect to LocalStack${NC}"
        echo "   Endpoint: $LOCALSTACK_ENDPOINT"
        echo "   Make sure LocalStack is running and accessible"
        return 1
    fi
}

# Function to show expected secrets
show_expected_secrets() {
    echo ""
    echo "📋 Expected Secrets (based on helm/shared-config values):"
    echo "========================================================"
    echo "   🔑 acme-db - Main acme database connection (used in !ssm<acme-db>[field])"
    echo "      Expected fields: host, port, database, user, password"
    echo ""
    echo "   🔑 crm-db - CRM database connection (used in !ssm<crm-db>[field])"
    echo "      Expected fields: host, port, database, user, password"
    echo ""
    echo "   🔑 Legacy secrets (from LocalStack init job):"
    echo "      • mysql-database - Legacy MySQL connection details"
    echo "      • postgres-database - Legacy PostgreSQL connection details"
    echo "      • aws-credentials - AWS credentials for batch processing"
    echo ""
    echo "💡 These secrets should be created by the LocalStack seeding in local-up.sh"
    echo "   If missing, run: ./scripts/infrastructure/local-up.sh"
}

# Function to validate expected secret structure
validate_secret_structure() {
    local region="$1"
    local secret_name="$2"
    local expected_fields="$3"
    
    echo "      🔍 Validating structure for $secret_name..."
    
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --endpoint-url "$LOCALSTACK_ENDPOINT" \
        --region "$region" \
        --secret-id "$secret_name" \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$secret_value" ]; then
        echo -e "         ${RED}❌ Could not retrieve secret value${NC}"
        return 1
    fi
    
    # Check if it's valid JSON
    if ! echo "$secret_value" | jq . >/dev/null 2>&1; then
        echo -e "         ${YELLOW}⚠️  Secret is not JSON format${NC}"
        return 1
    fi
    
    # Check for expected fields
    local missing_fields=()
    IFS=',' read -ra FIELDS <<< "$expected_fields"
    for field in "${FIELDS[@]}"; do
        field=$(echo "$field" | xargs) # trim whitespace
        if ! echo "$secret_value" | jq -e ".$field" >/dev/null 2>&1; then
            missing_fields+=("$field")
        fi
    done
    
    if [ ${#missing_fields[@]} -eq 0 ]; then
        echo -e "         ${GREEN}✅ All expected fields present${NC}"
        return 0
    else
        echo -e "         ${YELLOW}⚠️  Missing fields: ${missing_fields[*]}${NC}"
        return 1
    fi
}

# Main execution
main() {
    # Check if AWS CLI is available
    if ! command -v aws >/dev/null 2>&1; then
        echo -e "${RED}❌ AWS CLI not found${NC}"
        echo "   Install with: brew install awscli"
        exit 1
    fi
    
    # Set AWS credentials for LocalStack
    export AWS_ACCESS_KEY_ID="test"
    export AWS_SECRET_ACCESS_KEY="test"
    
    # Check LocalStack connectivity first
    if ! check_localstack_connectivity; then
        exit 1
    fi
    
    # Show expected secrets
    show_expected_secrets
    
    # Check each region
    local total_secrets=0
    local regions_with_secrets=0
    
    for region in "${REGIONS[@]}"; do
        check_region_secrets "$region"
        
        # Count secrets in this region
        local region_secrets
        region_secrets=$(aws secretsmanager list-secrets \
            --endpoint-url "$LOCALSTACK_ENDPOINT" \
            --region "$region" \
            --query 'length(SecretList)' \
            --output text 2>/dev/null || echo "0")
        
        if [ "$region_secrets" -gt 0 ]; then
            total_secrets=$((total_secrets + region_secrets))
            regions_with_secrets=$((regions_with_secrets + 1))
        fi
    done
    
    # Summary
    echo ""
    echo "🎯 Secrets Manager Summary"
    echo "=========================="
    echo -e "Total secrets found: ${BLUE}$total_secrets${NC}"
    echo -e "Regions with secrets: ${BLUE}$regions_with_secrets${NC} / ${#REGIONS[@]}"
    
    if [ $total_secrets -gt 0 ]; then
        echo -e "${GREEN}✅ Secrets Manager validation passed${NC}"
        
        # Show access information
        echo ""
        echo "🔧 Access Information:"
        echo "   • LocalStack endpoint: $LOCALSTACK_ENDPOINT"
        echo "   • AWS CLI access: aws secretsmanager list-secrets --endpoint-url $LOCALSTACK_ENDPOINT --region us-west-2"
        echo "   • Web UI: http://localhost:30568 (if LocalStack Pro)"
        
        exit 0
    else
        echo -e "${RED}❌ No secrets found in any region${NC}"
        echo ""
        echo "🔧 Troubleshooting:"
        echo "   • Ensure LocalStack is running: kubectl get pods -n acme-infrastructure"
        echo "   • Run initialization: ./scripts/infrastructure/local-up.sh"
        echo "   • Check LocalStack logs: kubectl logs -l component=localstack -n acme-infrastructure"
        echo "   • Verify LocalStack init job: kubectl get jobs -l component=localstack-init -n acme-services"
        
        exit 1
    fi
}

# Run main function
main
