# Two-Tier Secret Management: Step-by-Step Walkthrough

## 🎯 The Complete Flow

### Step 1: Infrastructure Secrets (Source of Truth)
**File**: `helm/acme-infrastructure/values.yaml`
```yaml
mysql:
  secrets:
    rootPassword: "root_password"
    userPassword: "acme_password"

postgresql:
  secrets:
    password: "postgres_password"
```

**What happens**: 
- Clear-text passwords stored in Helm values
- These get deployed to MySQL/PostgreSQL containers directly
- ✅ **Infrastructure containers work immediately**

### Step 2: Bootstrap Process
**Command**: `./testing/configuration/bootstrap-app-secrets.sh`

**What it does**:
1. **Reads** infrastructure values from Step 1
2. **Creates** application ConfigMaps with `!ssm<secret>[field]` pattern
3. **Populates** LocalStack Secrets Manager with actual values

**Result**: Creates this ConfigMap in `acme-services` namespace:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: database-config
  namespace: acme-services
  annotations:
    secrets.acme.io/resolve: "true"
data:
  mysql_password: "!ssm<mysql-database>[root_password]"
  postgres_password: "!ssm<postgres-database>[password]"
```

**AND** populates LocalStack with:
```json
// Secret: mysql-database
{
  "root_password": "root_password",
  "user_password": "acme_password"
}

// Secret: postgres-database  
{
  "password": "postgres_password"
}
```

### Step 3: Application Runtime
**Application code**:
```typescript
import { ConfigProvider } from '@platform/configuration';

// Application uses dot-notation to access config
const mysqlPassword = await ConfigProvider.get('mysql.password');
// ConfigProvider maps this to ConfigMap key and resolves the !ssm pattern

// Behind the scenes:
// 1. Maps 'mysql.password' to ConfigMap key 'mysql_password' 
// 2. Finds value: "!ssm<mysql-database>[root_password]"
// 3. Parses: secretId="mysql-database", field="root_password"
// 4. Calls AWS Secrets Manager (LocalStack): getSecret("mysql-database")
// 5. Extracts field: result["root_password"]
// 6. Returns: "root_password"
```

**Final result**: Application gets `"root_password"` - the same value from infrastructure!

## 🔄 Data Flow Diagram

```
Infrastructure values.yaml
    ↓ (clear-text)
Infrastructure containers (MySQL, etc.)
    ↓ (bootstrap script)
Application ConfigMaps (!ssm pattern)
    ↓ (ConfigProvider resolution)
LocalStack Secrets Manager
    ↓ (runtime lookup)
Application containers (resolved values)
```

## 🎭 Two Environments, Same Code

### Local Development
- Infrastructure: Clear-text in values.yaml
- Applications: `!ssm<secret>[field]` → LocalStack
- **Result**: Everything works locally

### AWS Production  
- Infrastructure: RDS/ElastiCache (managed services)
- Applications: `!ssm<secret>[field]` → AWS Secrets Manager
- **Result**: Same application code, real AWS secrets

## 🔧 Maintenance

**To change a password**:
1. Update `helm/acme-infrastructure/values.yaml`
2. Run `helm upgrade acme-infrastructure`
3. Run bootstrap script
4. **Done** - both infrastructure and applications updated automatically

**No manual coordination required!**
