#!/bin/bash
set -e

echo "🗄️  Checking database schema and seed data..."

# Configuration
MYSQL_HOST="localhost"
MYSQL_PORT="30306"
MYSQL_USER="root"
MYSQL_PASSWORD="root_password"
CRM_DATABASE="crm_db"

echo "📍 MySQL endpoint: $MYSQL_HOST:$MYSQL_PORT"
echo "🗄️  Database: $CRM_DATABASE"

# Function to run MySQL query
run_mysql_query() {
    local query="$1"
    mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -D "$CRM_DATABASE" -e "$query" 2>/dev/null
}

# Function to check if database exists
check_database_exists() {
    mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SHOW DATABASES LIKE '$CRM_DATABASE';" 2>/dev/null | grep -q "$CRM_DATABASE"
}

echo ""
echo "🔍 Checking database existence..."

if ! check_database_exists; then
    echo "   ❌ Database '$CRM_DATABASE' does not exist"
    database_status="FAIL"
else
    echo "   ✅ Database '$CRM_DATABASE' exists"
    database_status="PASS"
fi

echo ""
echo "📊 Validating table structure and data..."

# Check tables exist
EXPECTED_TABLES=("contacts" "campaigns" "batch_files")
missing_tables=0

# Only check tables if database exists
if [ "$database_status" = "PASS" ]; then
    for table in "${EXPECTED_TABLES[@]}"; do
        if run_mysql_query "SHOW TABLES LIKE '$table';" | grep -q "$table"; then
            echo "   ✅ Table: $table"
            
            # Show row counts
            row_count=$(run_mysql_query "SELECT COUNT(*) FROM $table;" | tail -n 1)
            echo "      📊 Rows: $row_count"
            
            # Show sample data for contacts table
            if [ "$table" = "contacts" ] && [ "$row_count" -gt 0 ]; then
                echo "      📋 Sample data:"
                run_mysql_query "SELECT id, first_name, last_name, email, status FROM $table LIMIT 3;" | tail -n +2 | sed 's/^/         /'
            fi
            
        else
            echo "   ❌ Table: $table (missing)"
            missing_tables=$((missing_tables + 1))
        fi
    done
else
    echo "   ⚠️  Skipping table validation - database does not exist"
    missing_tables=999  # Force failure
fi

echo ""
echo "🎯 Database Schema Check Summary:"
if [ "$database_status" = "PASS" ] && [ $missing_tables -eq 0 ]; then
    echo "✅ Database schema validation passed"
    exit 0
else
    echo "❌ Database schema validation failed"
    echo "💡 Run initialization to create missing database/tables"
    exit 1
fi
