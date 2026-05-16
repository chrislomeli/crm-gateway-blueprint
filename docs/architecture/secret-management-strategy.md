# Two-Tier Secret Management Strategy

## Overview

This project uses a pragmatic two-tier approach to secret management that separates local development infrastructure from production application requirements.

## Architecture

### Tier 1: Infrastructure Secrets (Local Development Only)
- **Namespace**: `acme-infrastructure`
- **Storage**: Clear-text in Helm values.yaml and ConfigMaps
- **Scope**: MySQL, PostgreSQL, LocalStack, Redis containers
- **Rationale**: These containers won't exist in AWS production (replaced by RDS, ElastiCache, etc.)

### Tier 2: Application Secrets (Production Ready)
- **Namespace**: `acme-services`
- **Storage**: `!ssm<secret>[field]` pattern in ConfigMaps
- **Resolution**: ConfigProvider + AWS Secrets Manager
- **Scope**: All application containers that deploy to production

## Bootstrap Process

The bootstrap mechanism automatically synchronizes secrets from infrastructure to applications:

1. **Source**: Infrastructure values.yaml (single source of truth)
2. **Transform**: Clear-text → `!ssm<secret>[field]` pattern
3. **Populate**: LocalStack Secrets Manager for development
4. **Result**: Applications use production-ready secret resolution

## Benefits

- ✅ **No over-engineering**: Infrastructure containers use simple clear-text
- ✅ **Production ready**: Applications use proper secret management
- ✅ **Single source**: Infrastructure values.yaml drives everything
- ✅ **Zero coordination**: Automated bootstrap eliminates manual sync
- ✅ **AWS compatible**: Applications work identically in EKS

## Example

### Infrastructure (acme-infrastructure namespace)
```yaml
# values.yaml
mysql:
  secrets:
    rootPassword: "root_password"  # Clear-text for local dev
```

### Application (acme-services namespace)
```yaml
# ConfigMap
data:
  mysql_password: "!ssm<mysql-database>[root_password]"  # Production pattern
```

### Runtime Resolution
```typescript
// Application code
const password = await ConfigProvider.get('mysql.password');
// Returns: "root_password" (from LocalStack in dev, AWS Secrets Manager in prod)
```

## Migration Path

1. **Local Development**: Bootstrap from infrastructure values
2. **AWS Production**: Replace LocalStack with real AWS Secrets Manager
3. **Zero Code Changes**: Applications work identically in both environments
