# Batch Processing Testing

## Testing Strategies

The batch processing system is designed with testing-first principles, enabling immediate validation without waiting for scheduled execution.

## CronJob Testing

### Instant Testing Pattern
```bash
# Deploy the CronJob (starts suspended for safety)
kubectl apply -f k8s.md/local/batch-dispatcher-deployment.yaml

# Test immediately without waiting for schedule
kubectl create job --from=cronjob/batch-dispatcher test-run-$(date +%s)

# Watch the job execute
kubectl get repositories -w

# Check logs for results
kubectl logs job/test-run-1234567890

# If successful, enable scheduling
kubectl patch cronjob batch-dispatcher -p '{"spec":{"suspend":false}}'
```

### Fast Schedule Testing
```bash
# Temporarily set to run every minute for testing
kubectl patch cronjob batch-dispatcher -p '{"spec":{"schedule":"* * * * *"}}'

# Watch it run several times
kubectl get repositories -w

# Set back to production schedule
kubectl patch cronjob batch-dispatcher -p '{"spec":{"schedule":"*/5 * * * *"}}'
```

## Database Testing

### Database Initialization
```bash
# Initialize MySQL with sample data
./scripts/init-database-local.sh mysql

# Initialize PostgreSQL with sample data  
./scripts/init-database-local.sh postgres

# Switch between databases for testing
./scripts/init-database-local.sh mysql clean
./scripts/init-database-local.sh postgres
```

### Database Validation
```bash
# Verify MySQL schema and data
kubectl exec -it deployment/mysql -- mysql -u pipeline_user -ppipeline_password -e "
USE event;
SELECT business_id, business_prefix, crm, status FROM batch_tenants ORDER BY business_id;
SELECT jd.name, jr.trigger_type, jr.status FROM job_definitions jd 
JOIN job_runs jr ON jd.id = jr.job_definition_id ORDER BY jd.name;
"

# Verify PostgreSQL schema and data
kubectl exec -it deployment/postgres -- psql -U pipeline_user -d event -c "
SELECT business_id, business_prefix, crm, status FROM batch_tenants ORDER BY business_id;
SELECT jd.name, jr.trigger_type, jr.status FROM job_definitions jd 
JOIN job_runs jr ON jd.id = jr.job_definition_id ORDER BY jd.name;
"
```

## Configuration Testing

### Configuration Validation
```bash
# Verify all ConfigMaps exist
for cm in infrastructure-config environment-config batch-dispatcher-config; do
  if kubectl get configmap $cm >/dev/null 2>&1; then
    echo "✅ ConfigMap '$cm' exists"
  else
    echo "❌ ConfigMap '$cm' missing"
  fi
done

# Check if deployment can access configs
kubectl describe deployment batch-dispatcher | grep -A 20 'Environment:'
```

### Configuration Updates
```bash
# Test configuration hot-reloading
kubectl patch configmap batch-dispatcher-config -p '{"data":{"batch.max-concurrent-tenants":"20"}}'

# Restart to pick up changes
kubectl rollout restart cronjob/batch-dispatcher

# Verify new config is loaded
kubectl create job --from=cronjob/batch-dispatcher config-test-$(date +%s)
kubectl logs job/config-test-1234567890 | grep "max-concurrent-tenants"
```

## Integration Testing

### End-to-End Workflow
```bash
# 1. Initialize database
./scripts/init-database-local.sh mysql

# 2. Apply all configurations
kubectl apply -f k8s.md/shared/infrastructure-config.yaml
kubectl apply -f k8s.md/local/environment-config.yaml  
kubectl apply -f k8s.md/local/batch-dispatcher-config.yaml

# 3. Deploy batch-dispatcher
kubectl apply -f k8s.md/local/batch-dispatcher-deployment.yaml

# 4. Test tenant processing
kubectl create job --from=cronjob/batch-dispatcher integration-test-$(date +%s)

# 5. Verify results
kubectl logs job/integration-test-1234567890
```

### SQS Message Testing
```bash
# Check SQS queue configuration
kubectl exec -it deployment/batch-dispatcher -- env | grep SQS

# Verify LocalStack SQS queues exist
kubectl exec -it deployment/localstack -- awslocal sqs list-queues

# Test message publishing (if applicable)
kubectl exec -it deployment/batch-dispatcher -- node -e "
const { SQSService } = require('@platform/services');
const sqs = new SQSService();
sqs.sendMessage(process.env.SQS_BATCH_PROCESSING_QUEUE, {test: 'message'});
"
```

## Debugging and Troubleshooting

### Common Issues

#### CronJob Not Running
```bash
# Check if CronJob is suspended
kubectl get cronjob batch-dispatcher -o jsonpath='{.spec.suspend}'

# Check CronJob schedule
kubectl get cronjob batch-dispatcher -o jsonpath='{.spec.schedule}'

# View CronJob events
kubectl describe cronjob batch-dispatcher
```

#### Job Failures
```bash
# List failed repositories
kubectl get repositories --field-selector status.successful!=1

# Check job logs
kubectl logs job/batch-dispatcher-failed-job

# Check job events
kubectl describe job batch-dispatcher-failed-job
```

#### Configuration Issues
```bash
# Check if ConfigMaps exist
kubectl get configmaps

# Verify ConfigMap data
kubectl get configmap infrastructure-config -o yaml

# Check environment variables in pod
kubectl exec -it job/test-job -- env | grep -E "(SQS|MYSQL|BATCH)"
```

### Debugging Commands

#### View Job History
```bash
# List all batch-dispatcher repositories
kubectl get repositories -l app=batch-dispatcher

# View successful repositories
kubectl get repositories -l app=batch-dispatcher --field-selector status.successful=1

# View failed repositories
kubectl get repositories -l app=batch-dispatcher --field-selector status.failed=1
```

#### Monitor Real-Time Execution
```bash
# Watch repositories as they're created
kubectl get repositories -w

# Follow job logs in real-time
kubectl logs -f job/batch-dispatcher-12345

# Monitor CronJob status
watch kubectl get cronjobs
```

## Performance Testing

### Load Testing
```bash
# Create multiple test repositories simultaneously
for i in {1..5}; do
  kubectl create job --from=cronjob/batch-dispatcher load-test-$i-$(date +%s) &
done

# Monitor resource usage
kubectl top pods -l app=batch-dispatcher

# Check job completion times
kubectl get repositories -l app=batch-dispatcher -o custom-columns=NAME:.metadata.name,DURATION:.status.completionTime
```

### Resource Monitoring
```bash
# Monitor CPU and memory usage
kubectl top pods -l app=batch-dispatcher --containers

# Check resource limits
kubectl describe cronjob batch-dispatcher | grep -A 10 "Limits:"

# View resource requests
kubectl describe cronjob batch-dispatcher | grep -A 10 "Requests:"
```

## Test Data Management

### Sample Tenant Data
The database initialization creates sample tenants:
- `tenant_00001` (HubSpot) - ACTIVE
- `tenant_00002` (Salesforce) - ACTIVE  
- `tenant_00003` (Pipedrive) - ACTIVE
- `tenant_00004` (Zoho) - PAUSED
- `tenant_00005` (Gohio) - ACTIVE

### Sample Job Data
- Daily Sales Report (scheduled)
- Weekly Marketing Report (manual)
- Monthly Customer Report (API triggered)

### Reset Test Data
```bash
# Reset database to clean state
./scripts/init-database-local.sh mysql clean
./scripts/init-database-local.sh mysql

# Clean up test repositories
kubectl delete repositories -l app=batch-dispatcher

# Reset CronJob to suspended state
kubectl patch cronjob batch-dispatcher -p '{"spec":{"suspend":true}}'
```

## Continuous Testing

### Automated Testing Pipeline
```bash
#!/bin/bash
# test-batch-processing.sh

set -e

echo "🧪 Running batch processing tests..."

# 1. Initialize database
./scripts/init-database-local.sh mysql

# 2. Apply configurations
kubectl apply -f k8s.md/shared/infrastructure-config.yaml
kubectl apply -f k8s.md/local/environment-config.yaml
kubectl apply -f k8s.md/local/batch-dispatcher-config.yaml
kubectl apply -f k8s.md/local/batch-dispatcher-deployment.yaml

# 3. Wait for CronJob to be ready
sleep 10

# 4. Run test job
JOB_NAME="test-$(date +%s)"
kubectl create job --from=cronjob/batch-dispatcher $JOB_NAME

# 5. Wait for completion
kubectl wait --for=condition=complete job/$JOB_NAME --timeout=300s

# 6. Check results
if kubectl logs job/$JOB_NAME | grep -q "Processing completed successfully"; then
  echo "✅ Batch processing test passed"
  exit 0
else
  echo "❌ Batch processing test failed"
  kubectl logs job/$JOB_NAME
  exit 1
fi
```
