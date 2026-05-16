# Batch Processing Configuration

## Configuration Architecture

The batch processing system uses **Helm-managed ConfigMap volume mounts** for professional Kubernetes configuration management. This approach eliminates environment variables and provides clean separation between shared infrastructure and application-specific settings.

## ⚠️ **IMPORTANT: MySQL Connection Requirements**

**Critical Configuration Fields for BatchFileTrackingService:**

The batch dispatcher requires specific configuration keys to function properly:

```yaml
# Required MySQL Configuration (must use 'user' not 'username')
mysql.host: "mysql.acme-infrastructure.svc.cluster.local"
mysql.port: "3306" 
mysql.database: "acme"
mysql.user: "acme_user"        # ⚠️ MUST be 'user' not 'username'
mysql.password: "acme_password"

# Required DataStore Configuration (BatchFileTrackingService dependency)
dataStore.tenantsTable: "batch_tenants"
dataStore.filesTable: "batch_files"
dataStore.historyTable: "batch_processing_history"
dataStore.dashboardView: "batch_tenant_dashboard_view"
```

**Common Issues Fixed:**
- ✅ **Field Name Mismatch**: MySQLService expects `mysql.user` not `mysql.username`
- ✅ **Missing DataStore Config**: BatchFileTrackingService requires `dataStore.*` configuration
- ✅ **Database Initialization**: Run `kubectl apply -f k8s/mysql-batch-init.yaml` to create tables

## Modern Helm-Based Configuration

### Current Implementation: Helm Charts with ConfigMap Volume Mounts

**File**: `helm/batch-processing/templates/configmaps.yaml`
**Purpose**: Professional Kubernetes configuration using Helm templating

```yaml
# Shared Infrastructure ConfigMap (mounted at /config/shared)
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "batch-processing.fullname" . }}-infrastructure
data:
  # MySQL Configuration (corrected field names)
  mysql.host: {{ .Values.infrastructure.database.mysql.host | quote }}
  mysql.port: {{ .Values.infrastructure.database.mysql.port | quote }}
  mysql.database: {{ .Values.infrastructure.database.mysql.database | quote }}
  mysql.user: {{ .Values.infrastructure.database.mysql.username | quote }}  # Note: 'user' not 'username'
  mysql.password: {{ .Values.infrastructure.database.mysql.password | quote }}
  
  # DataStore Configuration (required by BatchFileTrackingService)
  dataStore.tenantsTable: "batch_tenants"
  dataStore.filesTable: "batch_files"
  dataStore.historyTable: "batch_processing_history"
  dataStore.dashboardView: "batch_tenant_dashboard_view"
  
  # SQS Configuration
  sqs.batch-import-queue: {{ .Values.infrastructure.sqs.batchImportQueue | quote }}
  sqs.batch-processing-queue: {{ .Values.infrastructure.sqs.batchProcessingQueue | quote }}
  sqs.dead-letter-queue: {{ .Values.infrastructure.sqs.deadLetterQueue | quote }}
  
  # S3 Configuration
  s3.batch-files-bucket: {{ .Values.infrastructure.s3.batchFilesBucket | quote }}
  s3.processed-files-bucket: {{ .Values.infrastructure.s3.processedFilesBucket | quote }}
```

### 2. Environment Config
**File**: `k8s/local/environment-config.yaml`
**Purpose**: Environment-specific settings (local, dev, staging, prod)

```yaml
# k8s.md/local/environment-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: environment-config
data:
  # Environment Settings
  environment: "local"
  log-level: "debug"
  
  # AWS Configuration (LocalStack for local)
  aws.region: "us-west-2"
  aws.endpoint-override: "http://localstack:4566"
  aws.use-localstack: "true"
  
  # Database Selection (for easy switching)
  database.primary: "mysql"  # or "postgres"
```

### 3. App-Specific Config
**File**: `k8s/local/batch-dispatcher-config.yaml`
**Purpose**: Service-specific settings and business logic configuration

```yaml
# k8s.md/local/batch-dispatcher-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: batch-dispatcher-config
data:
  # Batch Dispatcher Specific Configuration
  batch.max-concurrent-tenants: "10"
  batch.tenant-processing-timeout: "300"
  batch.heartbeat-interval: "30"
  
  # CRM Registry Configuration
  crm.hubspot.task-definition: "batch-importer-hubspot"
  crm.salesforce.task-definition: "batch-importer-salesforce"
  crm.pipedrive.task-definition: "batch-importer-pipedrive"
```

## Configuration Usage in Deployments

### Environment Variable Injection
```yaml
# batch-dispatcher-deployment.yaml
env:
# Environment-specific configs
- name: ENVIRONMENT
  valueFrom:
    configMapKeyRef:
      name: environment-config
      key: environment

# Infrastructure configs (shared)
- name: SQS_BATCH_PROCESSING_QUEUE
  valueFrom:
    configMapKeyRef:
      name: infrastructure-config
      key: sqs.batch-processing-queue

# App-specific configs
- name: BATCH_MAX_CONCURRENT_TENANTS
  valueFrom:
    configMapKeyRef:
      name: batch-dispatcher-config
      key: batch.max-concurrent-tenants
```

### Volume Mounts (Optional)
```yaml
volumeMounts:
- name: app-config
  mountPath: /app/config
  readOnly: true

volumes:
- name: app-config
  configMap:
    name: batch-dispatcher-config
```

## Application Configuration Access

### ConfigProvider Usage
```typescript
// In your application code
const queueUrl = ConfigProvider.get('sqs.batch-processing-queue');
const maxTenants = ConfigProvider.get('batch.max-concurrent-tenants');
const environment = ConfigProvider.get('environment');
```

### Environment Variable Access
```typescript
// Direct environment variable access
const queueUrl = process.env.SQS_BATCH_PROCESSING_QUEUE;
const maxTenants = parseInt(process.env.BATCH_MAX_CONCURRENT_TENANTS || '10');
```

## Environment-Specific Configurations

### Local Development
```yaml
# k8s.md/local/environment-config.yaml
data:
  environment: "local"
  aws.endpoint-override: "http://localstack:4566"
  database.primary: "mysql"
  log-level: "debug"
```

### Development Environment
```yaml
# k8s.md/dev/environment-config.yaml
data:
  environment: "dev"
  aws.region: "us-west-2"
  database.primary: "postgres"
  log-level: "info"
```

### Production Environment
```yaml
# k8s.md/prod/environment-config.yaml
data:
  environment: "prod"
  aws.region: "us-west-2"
  database.primary: "postgres"
  log-level: "warn"
```

## Secrets Management

### Database Credentials
```yaml
# In production, use Secrets instead of ConfigMaps
apiVersion: v1
kind: Secret
metadata:
  name: database-credentials
type: Opaque
data:
  mysql-user: <base64-encoded>
  mysql-password: <base64-encoded>
```

### AWS Secrets Manager Integration
```yaml
# Reference secrets using production syntax
data:
  mysql.password: "!ssm<mysql-database>[password]"
  sqs.queue-url: "!ssm<batch-processing>[queueUrl]"
```

## Helm Chart Preparation

### Values Structure
```yaml
# values.yaml (future Helm chart)
environment:
  name: local
  logLevel: debug

infrastructure:
  sqs:
    batchProcessingQueue: batch-processing-dev
  s3:
    batchFilesBucket: acme-batch-files-dev
  database:
    primary: mysql

batchDispatcher:
  maxConcurrentTenants: 10
  scanInterval: 60
  schedule: "*/5 * * * *"
```

### Template Example
```yaml
# templates/configmap.yaml (future Helm template)
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "batch-dispatcher.fullname" . }}-config
data:
  batch.max-concurrent-tenants: {{ .Values.batchDispatcher.maxConcurrentTenants | quote }}
  sqs.batch-processing-queue: {{ .Values.infrastructure.sqs.batchProcessingQueue | quote }}
```

## Configuration Management Commands

### Apply Configurations
```bash
# Apply in correct order (dependencies)
kubectl apply -f k8s.md/shared/infrastructure-config.yaml
kubectl apply -f k8s.md/local/environment-config.yaml
kubectl apply -f k8s.md/local/batch-dispatcher-config.yaml
```

### Update Configurations
```bash
# Update specific config values
kubectl patch configmap batch-dispatcher-config -p '{"data":{"batch.max-concurrent-tenants":"20"}}'

# Restart deployments to pick up config changes
kubectl rollout restart cronjob/batch-dispatcher
```

### View Configurations
```bash
# View all config values
kubectl get configmap infrastructure-config -o yaml
kubectl get configmap environment-config -o yaml
kubectl get configmap batch-dispatcher-config -o yaml

# View specific config value
kubectl get configmap infrastructure-config -o jsonpath='{.data.sqs\.batch-processing-queue}'
```

## 🔧 **Troubleshooting: MySQL Connection Issues**

### Common MySQL Connection Problems and Solutions

#### 1. **"Access denied for user" Authentication Error**

**Problem**: MySQLService receives `undefined` for username
```
ERROR: Access denied for user ''@'mysql.acme-infrastructure.svc.cluster.local'
```

**Root Cause**: Field name mismatch between ConfigMap and MySQLService expectations

**Solution**: Ensure ConfigMap uses `mysql.user` (not `mysql.username`)
```yaml
# ✅ CORRECT - MySQLService expects 'user'
mysql.user: "acme_user"

# ❌ WRONG - Will result in undefined username  
mysql.username: "acme_user"
```

**Fix Command**:
```bash
# Update Helm values and redeploy
helm upgrade batch-processing ./helm/batch-processing -n acme-services
```

#### 2. **"Table 'acme.undefined' doesn't exist" Error**

**Problem**: BatchFileTrackingService queries undefined table names
```
ERROR: Table 'acme.undefined' doesn't exist
SELECT * FROM undefined
```

**Root Cause**: Missing `dataStore` configuration in ConfigMaps

**Solution**: Add required dataStore configuration to ConfigMaps
```yaml
# Required in helm/batch-processing/templates/configmap.yaml
dataStore.tenantsTable: "batch_tenants"
dataStore.filesTable: "batch_files" 
dataStore.historyTable: "batch_processing_history"
dataStore.dashboardView: "batch_tenant_dashboard_view"
```

**Fix Command**:
```bash
# Update ConfigMaps and redeploy
helm upgrade batch-processing ./helm/batch-processing -n acme-services
```

#### 3. **"Batch tracking tables not found" Error**

**Problem**: Database exists but lacks required batch processing tables
```
ERROR: Batch tracking tables not found. Please run the SQL initialization script.
```

**Solution**: Initialize MySQL database with batch processing schema
```bash
# Run MySQL initialization job
kubectl apply -f k8s.md/mysql-batch-init.yaml

# Wait for completion
kubectl wait --for=condition=complete job/mysql-batch-init -n acme-services

# Check results
kubectl logs job/mysql-batch-init -n acme-services
```

#### 4. **ConfigProvider Initialization Issues**

**Problem**: Configuration not loading from ConfigMap volume mounts
```
ERROR: Configuration not initialized
```

**Solution**: Verify ConfigMap volume mounts in deployment
```yaml
# In batch-dispatcher CronJob template
volumeMounts:
- name: shared-config
  mountPath: /config/shared
  readOnly: true
- name: app-config  
  mountPath: /config/app
  readOnly: true

volumes:
- name: shared-config
  configMap:
    name: batch-processing-infrastructure
- name: app-config
  configMap:
    name: batch-processing-environment
```

### Diagnostic Commands

```bash
# Check batch dispatcher logs
kubectl logs -l app=batch-dispatcher -n acme-services --tail=50

# Test MySQL connection manually
kubectl exec -it deployment/mysql -n acme-infrastructure -- \
  mysql -u acme_user -pacme_password -e "USE acme; SHOW TABLES;"

# Verify ConfigMap contents
kubectl get configmap batch-processing-infrastructure -n acme-services -o yaml

# Check if batch tables exist
kubectl exec -it deployment/mysql -n acme-infrastructure -- \
  mysql -u acme_user -pacme_password -e "USE acme; SELECT COUNT(*) FROM batch_tenants;"

# Run configuration test
kubectl apply -f k8s.md/config-test-job.yaml
kubectl logs job/config-test -n acme-services
```

### Quick Resolution Checklist

When batch dispatcher fails with MySQL issues:

1. ✅ **Check field names**: Ensure `mysql.user` not `mysql.username` in ConfigMaps
2. ✅ **Verify dataStore config**: Confirm `dataStore.*` keys exist in ConfigMaps  
3. ✅ **Initialize database**: Run `k8s/mysql-batch-init.yaml` to create tables
4. ✅ **Test connection**: Use diagnostic commands to verify MySQL connectivity
5. ✅ **Redeploy services**: `helm upgrade` after configuration changes

### Validation Steps

After applying fixes:
```bash
# 1. Create test job from CronJob
kubectl create job --from=cronjob/batch-processing-batch-dispatcher \
  batch-dispatcher-test-$(date +%s) -n acme-services

# 2. Wait for completion  
kubectl wait --for=condition=complete job/batch-dispatcher-test-* -n acme-services

# 3. Check logs for success indicators
kubectl logs job/batch-dispatcher-test-* -n acme-services | grep -E "(MySQL connection|FOUND.*TENANTS|PROCESSING TENANT)"
```

**Expected Success Output**:
```
✅ MySQL connection pool created successfully
✅ MySQL connection test successful  
✅ 📊 FOUND 5 TOTAL TENANTS IN DATABASE
✅ ✅ PROCESSING TENANT: 1001 (CRM: hubspot)
```
