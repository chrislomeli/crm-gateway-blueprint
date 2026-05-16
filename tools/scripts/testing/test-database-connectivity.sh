#!/bin/bash

# Utility: Test database connectivity
# Usage: ./test-database-connectivity.sh [mysql|postgres|all]

set -e

DB_TYPE=${1:-all}

test_mysql() {
    echo "📊 Testing MySQL connectivity..."
    kubectl run mysql-test --rm -i --restart=Never --image=mysql:8.0 -- \
      mysql -h mysql.acme-infrastructure.svc.cluster.local -u root -proot_password \
      -e "SELECT 'MySQL connection successful' as status;" 2>/dev/null && echo "   ✅ MySQL: Connected" || echo "   ❌ MySQL: Failed"
}

test_postgres() {
    echo "🐘 Testing PostgreSQL connectivity..."
    kubectl run postgres-test --rm -i --restart=Never --image=postgres:15 --env="PGPASSWORD=postgres_password" -- \
      psql -h postgres.acme-infrastructure.svc.cluster.local -U postgres -d pipeline \
      -c "SELECT 'PostgreSQL connection successful' as status;" 2>/dev/null && echo "   ✅ PostgreSQL: Connected" || echo "   ❌ PostgreSQL: Failed"
}

case $DB_TYPE in
    mysql)
        test_mysql
        ;;
    postgres)
        test_postgres
        ;;
    all)
        test_mysql
        test_postgres
        ;;
    *)
        echo "Usage: $0 [mysql|postgres|all]"
        exit 1
        ;;
esac
