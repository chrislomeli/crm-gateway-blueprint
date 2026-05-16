# Exploring the Hubspoof Importer Example

This guide walks through the Hubspoof importer, which serves as a reference implementation for batch importers in Blueprint. Understanding this example will help you create your own importers.

## Hubspoof Importer Overview

The Hubspoof importer is a fully functional example that demonstrates how to:

1. Connect to a CRM API (simulated by the fake-crm-api service)
2. Download tenant data
3. Transform it into a standardized format
4. Upload it to S3
5. Record metadata in the database

## File Structure

The Hubspoof importer is located in:

```
packages/apps/contact-sync/contact-importers/src/adapters/hubspoof-importer/
```

Key files include:

- `src/HubspoofImporter.ts`: Main importer implementation
- `src/context-provider.ts`: Application context and configuration
- `src/types.ts`: TypeScript interfaces for Hubspoof data
- `intents-processor.ts`: Entry point that exports the importer

## Running the Hubspoof Importer

Let's run the Hubspoof importer to see it in action:

### Step 1: Check Tenant Configuration

First, verify that Hubspoof tenants are configured:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, crm_type, status FROM batch_tenants WHERE crm_type = 'hubspoof';"
```

### Step 2: Run the Batch Dispatcher

The batch dispatcher identifies tenants and creates jobs:

```bash
npx tsx packages/publishing/contact-sync/dispatcher-bulk/src/intent-handler.ts
```

### Step 3: Check the Dispatcher Queue

Verify that jobs were created in the queue:

```bash
awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/batch-dispatcher-queue --max-number-of-messages 10 --visibility-timeout 0
```

You should see messages with Hubspoof tenant information.

### Step 4: Run the Batch Importer

Now run the batch importer to process these jobs:

```bash
npx tsx packages/publishing/contact-sync/contact-importers/src/intent-handler.ts
```

### Step 5: Check the Results

Verify that files were uploaded to S3:

```bash
awslocal s3 ls s3://crmdata/exports/ --recursive
```

And check that metadata was recorded in the database:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, file_path, status FROM batch_files ORDER BY created_at DESC LIMIT 5;"
```

## Code Walkthrough

Let's examine the key components of the Hubspoof importer:

### 1. Importer Interface

All importers implement the `ICrmAdapter` interface:

```typescript
interface ICrmAdapter {
  downloadTenantData(tenant: TenantInfo): Promise<Result<BatchFileInfo[]>>;
}
```

### 2. Constructor and Initialization

The importer is initialized with configuration and services:

```typescript
constructor(
  private config: HubspoofConfig,
  private batchService: BatchFileTrackingService,
  private s3Service: S3Service
) {
  this.logger = createLogger('HubspoofImporter');
}
```

### 3. Download Method

The `downloadTenantData` method is the main entry point:

```typescript
async downloadTenantData(tenant: TenantInfo): Promise<Result<BatchFileInfo[]>> {
  try {
    // 1. Extract API key from tenant configuration
    const apiKey = tenant.crmInfo?.apiKey;
    
    // 2. Call the CRM API
    const contactsResult = await this.fetchContacts(tenant.businessId, apiKey);
    
    // 3. Process the data
    // 4. Upload to S3
    // 5. Record metadata
    
    return success(batchFiles);
  } catch (error) {
    return failureFromCatch(error, {
      type: 'HUBSPOOF_DOWNLOAD_ERROR',
      message: `Failed to download data for tenant ${tenant.businessId}`
    });
  }
}
```

### 4. API Interaction

The importer calls the CRM API to fetch data:

```typescript
private async fetchContacts(businessId: string, apiKey: string): Promise<Result<Contact[]>> {
  try {
    const url = `${this.config.apiEndpoint}/contacts?businessId=${businessId}`;
    const response = await axios.get(url, {
      headers: { 'X-API-Key': apiKey }
    });
    
    return success(response.data);
  } catch (error) {
    return failureFromCatch(error, {
      type: 'HUBSPOOF_API_ERROR',
      message: 'Failed to fetch contacts from Hubspoof API'
    });
  }
}
```

### 5. S3 Upload

After fetching data, the importer uploads it to S3:

```typescript
private async exportToS3(
  businessId: string,
  contacts: Contact[]
): Promise<Result<S3ObjectInfo>> {
  // Convert contacts to CSV format
  const csvData = this.convertToCSV(contacts);
  
  // Generate file name with timestamp
  const fileName = `hubspoof-${businessId}-${format(new Date(), 'yyyyMMddTHHmmss')}.contacts.csv`;
  
  // Upload to S3 with proper prefixing
  return await this.s3Service.uploadObject({
    bucket: this.config.s3Bucket,
    key: `exports/hubspoof/tenant_${businessId}/${fileName}`,
    body: csvData,
    contentType: 'text/csv'
  });
}
```

### 6. Database Recording

Finally, the importer records metadata in the database:

```typescript
private async recordFileMetadata(
  tenant: TenantInfo,
  s3Info: S3ObjectInfo
): Promise<Result<BatchFileInfo>> {
  return await this.batchService.createBatchFile({
    businessId: tenant.businessId,
    filePath: s3Info.key,
    fileSize: s3Info.size,
    status: 'DOWNLOADED',
    totalRecords: 0, // Will be updated by file discovery service
    metadata: {
      crmType: 'hubspoof',
      importType: 'scheduled'
    }
  });
}
```

## Key Takeaways

From the Hubspoof example, note these important patterns:

1. **Error Handling**: Uses the Result pattern consistently
2. **Configuration**: Reads from tenant configuration and system settings
3. **Separation of Concerns**: Distinct methods for API calls, transformation, and storage
4. **Logging**: Comprehensive logging for troubleshooting
5. **Type Safety**: Strong TypeScript typing throughout

## Next Steps

Now that you understand how the Hubspoof importer works, proceed to [Creating Your Own Importer](04-creating-importers.md) to learn how to build your own.
