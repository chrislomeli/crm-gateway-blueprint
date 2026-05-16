# Testing and Troubleshooting Batch Importers

This guide covers strategies for testing your batch importers and troubleshooting common issues that may arise during development.

## Testing Strategies

### Unit Testing

Write unit tests for your importer's core functionality:

```typescript
// Example unit test for YourCrmImporter
import { YourCrmImporter } from './YourCrmImporter';
import { success } from '@common/infrastructure/result';
import { mock, MockProxy } from 'jest-mock-extended';
import { BatchFileTrackingService } from '@common/framework/batch/publishing/file-tracking/BatchFileTrackingService';
import { S3Service } from '@common/infrastructure/storage/s3Service';

describe('YourCrmImporter', () => {
  let importer: YourCrmImporter;
  let mockBatchService: MockProxy<BatchFileTrackingService>;
  let mockS3Service: MockProxy<S3Service>;
  
  beforeEach(() => {
    mockBatchService = mock<BatchFileTrackingService>();
    mockS3Service = mock<S3Service>();
    
    importer = new YourCrmImporter(
      {
        apiEndpoint: 'http://mock-api',
        s3Bucket: 'test-bucket',
        s3Prefix: 'test-prefix'
      },
      mockBatchService,
      mockS3Service
    );
  });
  
  it('should handle missing API key', async () => {
    // Arrange
    const tenant = {
      businessId: 'test-tenant',
      crmType: 'yourcrm',
      crmInfo: {}
    };
    
    // Act
    const result = await importer.downloadTenantData(tenant);
    
    // Assert
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('YOURCRM_CONFIG_ERROR');
  });
  
  // Add more test for other scenarios
});
```

### Integration Testing

Create integration tests that verify your importer works with real services:

```typescript
// Example integration test
describe('YourCrmImporter Integration', () => {
  let importer: YourCrmImporter;
  let batchService: BatchFileTrackingService;
  let s3Service: S3Service;
  
  beforeEach(() => {
    // Use real publishing
    batchService = new BatchFileTrackingService();
    s3Service = new S3Service();
    
    importer = new YourCrmImporter(
      {
        apiEndpoint: 'http://localhost:3000/api/v1/yourcrm',
        s3Bucket: 'crmdata',
        s3Prefix: 'exports/yourcrm'
      },
      batchService,
      s3Service
    );
  });
  
  it('should download tenant data successfully', async () => {
    // This test requires a running local environment
    const tenant = {
      businessId: 'test-integration',
      crmType: 'yourcrm',
      crmInfo: { apiKey: 'test-integration-key' }
    };
    
    const result = await importer.downloadTenantData(tenant);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});
```

### End-to-End Testing

Test the complete flow from dispatcher to importer:

1. Add a test tenant to the database
2. Run the batch dispatcher
3. Run the batch importer
4. Verify files in S3 and database records

## Debugging Tools

### Docker Container Logs

View logs from Docker containers:

```bash
# View logs from all containers
docker-compose -f infrastructure/local/docker/docker-compose.yaml logs

# View logs from a specific container
docker-compose -f infrastructure/local/docker/docker-compose.yaml logs localstack
```

### Application Logs

When running the batch importer, enable debug logging:

```bash
LOG_LEVEL=debug npx tsx packages/publishing/contact-sync/contact-importers/src/intent-handler.ts
```

### Inspecting SQS Messages

View messages in SQS queues:

```bash
# View messages in the batch dispatcher queue
awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/batch-dispatcher-queue --max-number-of-messages 10 --visibility-timeout 0

# View messages in the batch processing queue
awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/batch-processing-queue --max-number-of-messages 10 --visibility-timeout 0
```

### Inspecting S3 Objects

List and view objects in S3:

```bash
# List objects in a bucket
awslocal s3 ls s3://crmdata/exports/ --recursive

# Download an object
awslocal s3 cp s3://crmdata/exports/yourcrm/tenant_67890/file.csv ./downloaded-file.csv

# View object metadata
awslocal s3api head-object --bucket crmdata --key exports/yourcrm/tenant_67890/file.csv
```

### Database Queries

Query the database for troubleshooting:

```bash
# View batch tenants
docker exec crmdb crmdb -uroot -proot event -e "SELECT * FROM batch_tenants;"

# View batch files
docker exec crmdb crmdb -uroot -proot event -e "SELECT * FROM batch_files ORDER BY created_at DESC LIMIT 10;"

# View batch repositories
docker exec crmdb crmdb -uroot -proot event -e "SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT 10;"
```

## Common Issues and Solutions

### Issue: Importer Not Processing Tenant

**Symptoms:**
- Tenant exists in database but no files are created
- No error messages in logs

**Possible Causes:**
1. Tenant status is not 'ACTIVE'
2. CRM type doesn't match your importer
3. Missing or invalid CRM credentials

**Solutions:**
1. Check tenant status:
   ```bash
   docker exec crmdb crmdb -uroot -proot event -e "SELECT business_id, crm_type, status FROM batch_tenants WHERE business_id = 'your-tenant-id';"
   ```

2. Update tenant status if needed:
   ```bash
   docker exec crmdb crmdb -uroot -proot event -e "UPDATE batch_tenants SET status = 'ACTIVE' WHERE business_id = 'your-tenant-id';"
   ```

3. Verify CRM credentials:
   ```bash
   docker exec crmdb crmdb -uroot -proot event -e "SELECT business_id, crm_info FROM batch_tenants WHERE business_id = 'your-tenant-id';"
   ```

### Issue: API Connection Failures

**Symptoms:**
- Error logs showing API connection failures
- Importer reports YOURCRM_API_ERROR

**Possible Causes:**
1. API endpoint not accessible
2. Invalid API credentials
3. Network configuration issues

**Solutions:**
1. Verify API endpoint is reachable:
   ```bash
   curl -v http://fake-crm-api:3000/api/v1/health
   ```

2. Check Docker network:
   ```bash
   docker network ls
   docker network inspect infrastructure_local_docker_default
   ```

3. Update API endpoint in configuration:
   ```bash
   awslocal ssm put-parameter --name "yourcrm.apiEndpoint" --type "String" --value "http://fake-crm-api:3000/api/v1/yourcrm" --overwrite
   ```

### Issue: S3 Upload Failures

**Symptoms:**
- Error logs showing S3 upload failures
- Importer reports YOURCRM_S3_ERROR

**Possible Causes:**
1. S3 bucket doesn't exist
2. Incorrect S3 configuration
3. Permission issues

**Solutions:**
1. Verify S3 bucket exists:
   ```bash
   awslocal s3 ls
   ```

2. Create bucket if needed:
   ```bash
   awslocal s3 mb s3://crmdata
   ```

3. Check S3 configuration:
   ```bash
   awslocal ssm get-parameter --name "exports.bucket"
   ```

### Issue: Database Record Creation Failures

**Symptoms:**
- Files uploaded to S3 but no database records
- Error logs showing database errors

**Possible Causes:**
1. Database connection issues
2. Missing required fields
3. Constraint violations

**Solutions:**
1. Check database connection:
   ```bash
   docker exec crmdb crmdb -uroot -proot -e "SHOW DATABASES;"
   ```

2. Verify batch_files table structure:
   ```bash
   docker exec crmdb crmdb -uroot -proot event -e "DESCRIBE batch_files;"
   ```

3. Check for duplicate records:
   ```bash
   docker exec crmdb crmdb -uroot -proot event -e "SELECT COUNT(*), file_path FROM batch_files GROUP BY file_path HAVING COUNT(*) > 1;"
   ```

## Performance Tuning

### Batch Size

If processing large datasets, consider implementing batching:

```typescript
private async fetchContacts(businessId: string, apiKey: string): Promise<Result<YourCrmContact[]>> {
  try {
    let allContacts: YourCrmContact[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;
    
    while (hasMore) {
      const url = `${this.config.apiEndpoint}/contacts?businessId=${businessId}&page=${page}&pageSize=${pageSize}`;
      const response = await axios.get(url, {
        headers: { 'X-API-Key': apiKey }
      });
      
      const contacts = response.data;
      allContacts = [...allContacts, ...contacts];
      
      hasMore = contacts.length === pageSize;
      page++;
    }
    
    return success(allContacts);
  } catch (error) {
    return failureFromCatch(error, {
      type: 'YOURCRM_API_ERROR',
      message: 'Failed to fetch contacts from YourCRM API'
    });
  }
}
```

### Parallel Processing

For multiple file types, consider parallel processing:

```typescript
async downloadTenantData(tenant: TenantInfo): Promise<Result<BatchFileInfo[]>> {
  try {
    // Fetch different data types in parallel
    const [contactsResult, dealsResult, companiesResult] = await Promise.all([
      this.fetchContacts(tenant.businessId, tenant.crmInfo?.apiKey),
      this.fetchDeals(tenant.businessId, tenant.crmInfo?.apiKey),
      this.fetchCompanies(tenant.businessId, tenant.crmInfo?.apiKey)
    ]);
    
    // Process results
    const results: Result<BatchFileInfo>[] = [];
    
    if (contactsResult.success) {
      const s3Result = await this.exportToS3(tenant.businessId, 'contacts', contactsResult.data);
      if (s3Result.success) {
        results.push(await this.recordFileMetadata(tenant, s3Result.data));
      }
    }
    
    // Similar processing for deals and companies
    
    // Filter successful results
    const successResults = results.filter(r => r.success).map(r => r.data as BatchFileInfo);
    return success(successResults);
  } catch (error) {
    return failureFromCatch(error, {
      type: 'YOURCRM_DOWNLOAD_ERROR',
      message: `Failed to download data for tenant ${tenant.businessId}`
    });
  }
}
```

## Monitoring and Alerting

In a production environment, consider implementing:

1. **Metrics Collection**: Track import times, file sizes, and record counts
2. **Health Checks**: Add endpoints to check importer health
3. **Alerting**: Set up alerts for failed imports or performance degradation
4. **Dashboards**: Create dashboards to visualize import activity

## Next Steps

Congratulations! You now have the knowledge to create, test, and troubleshoot batch importers in the Blueprint system. As you develop your importer, consider these next steps:

1. Implement more robust error handling and retries
2. Add support for incremental imports
3. Create a monitoring dashboard for your importer
4. Contribute improvements to the core batch framework

For additional help, refer to the API documentation or reach out to the Blueprint team.
