# Creating Your Own Batch Importer

This guide walks you through the process of creating your own batch importer for a new CRM system. We'll use the Hubspoof importer as a reference but create a new implementation.

## Step 1: Plan Your Importer

Before writing code, plan your importer by answering these questions:

1. What CRM system are you connecting to?
2. What authentication method does it use (API key, OAuth, etc.)?
3. What data will you be importing (contacts, deals, etc.)?
4. How frequently will imports run?
5. What format will you use for the exported data (CSV, JSON, etc.)?

## Step 2: Create the Directory Structure

Create a new directory for your importer:

```bash
mkdir -p packages/publishing/contact-sync/contact-importers/src/importing/your-crm-importer/src
```

## Step 3: Define Types

Create a `types.ts` file to define interfaces for your CRM's data structures:

```typescript
// packages/publishing/contact-sync/contact-importers/src/importing/your-crm-importer/src/types.ts

export interface YourCrmConfig {
  apiEndpoint: string;
  s3Bucket: string;
  s3Prefix: string;
}

export interface YourCrmContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  // Add other fields specific to your CRM
}
```

## Step 4: Create Context Provider

Create a `context-provider.ts` file to handle configuration:

```typescript
// packages/publishing/contact-sync/contact-importers/src/importing/your-crm-importer/src/context-provider.ts

import { ConfigProvider } from '@common/infrastructure/config/configProvider';
import { YourCrmConfig } from './types';

export class ApplicationContext {
  private static instance: ApplicationContext;
  
  private constructor() {}
  
  public static getInstance(): ApplicationContext {
    if (!ApplicationContext.instance) {
      ApplicationContext.instance = new ApplicationContext();
    }
    return ApplicationContext.instance;
  }
  
  public getConfig(): YourCrmConfig {
    return {
      apiEndpoint: ConfigProvider.getConfig('yourcrm.apiEndpoint', 'http://fake-crm-api:3000/api/v1/yourcrm'),
      s3Bucket: ConfigProvider.getConfig('exports.bucket', 'crmdata'),
      s3Prefix: ConfigProvider.getConfig('yourcrm.s3Prefix', 'exports/yourcrm')
    };
  }
}
```

## Step 5: Implement the Importer

Create your main importer class:

```typescript
// packages/publishing/contact-sync/contact-importers/src/importing/your-crm-importer/src/YourCrmImporter.ts

import axios from 'axios';
import { format } from 'date-fns';
import { createLogger } from '@common/infrastructure/logging';
import { Result, success, failureFromCatch } from '@common/infrastructure/result';
import { ICrmAdapter } from '@common/framework/batch/types';
import { TenantInfo, BatchFileInfo } from '@common/framework/batch/types';
import { BatchFileTrackingService } from '@common/framework/batch/publishing/file-tracking/BatchFileTrackingService';
import { S3Service, S3ObjectInfo } from '@common/infrastructure/storage/s3Service';
import { YourCrmConfig, YourCrmContact } from './types';

export class YourCrmImporter implements ICrmAdapter {
  private logger = createLogger('YourCrmImporter');
  
  constructor(
    private config: YourCrmConfig,
    private batchService: BatchFileTrackingService,
    private s3Service: S3Service
  ) {}
  
  async downloadTenantData(tenant: TenantInfo): Promise<Result<BatchFileInfo[]>> {
    try {
      this.logger.info({ tenant: tenant.businessId }, 'Starting download for tenant');
      
      // Extract credentials from tenant configuration
      const apiKey = tenant.crmInfo?.apiKey;
      if (!apiKey) {
        return failureFromCatch(new Error('Missing API key'), {
          type: 'YOURCRM_CONFIG_ERROR',
          message: `Missing API key for tenant ${tenant.businessId}`
        });
      }
      
      // Fetch data from CRM
      const contactsResult = await this.fetchContacts(tenant.businessId, apiKey);
      if (!contactsResult.success) {
        return contactsResult;
      }
      
      const contacts = contactsResult.data;
      this.logger.info({ tenant: tenant.businessId, count: contacts.length }, 'Successfully fetched contacts');
      
      // Upload to S3
      const s3Result = await this.exportToS3(tenant.businessId, contacts);
      if (!s3Result.success) {
        return s3Result;
      }
      
      // Record in database
      const fileResult = await this.recordFileMetadata(tenant, s3Result.data);
      if (!fileResult.success) {
        return fileResult;
      }
      
      return success([fileResult.data]);
    } catch (error) {
      return failureFromCatch(error, {
        type: 'YOURCRM_DOWNLOAD_ERROR',
        message: `Failed to download data for tenant ${tenant.businessId}`
      });
    }
  }
  
  private async fetchContacts(businessId: string, apiKey: string): Promise<Result<YourCrmContact[]>> {
    try {
      const url = `${this.config.apiEndpoint}/contacts?businessId=${businessId}`;
      const response = await axios.get(url, {
        headers: { 'X-API-Key': apiKey }
      });
      
      return success(response.data);
    } catch (error) {
      return failureFromCatch(error, {
        type: 'YOURCRM_API_ERROR',
        message: 'Failed to fetch contacts from YourCRM API'
      });
    }
  }
  
  private convertToCSV(contacts: YourCrmContact[]): string {
    // Implement CSV conversion logic
    const headers = 'id,firstName,lastName,email,phone\n';
    const rows = contacts.map(contact => 
      `${contact.id},${contact.firstName},${contact.lastName},${contact.email},${contact.phone || ''}`
    ).join('\n');
    
    return headers + rows;
  }
  
  private async exportToS3(
    businessId: string,
    contacts: YourCrmContact[]
  ): Promise<Result<S3ObjectInfo>> {
    try {
      // Convert contacts to CSV
      const csvData = this.convertToCSV(contacts);
      
      // Generate file name with timestamp
      const fileName = `yourcrm-${businessId}-${format(new Date(), 'yyyyMMddTHHmmss')}.contacts.csv`;
      
      // Generate S3 key with date partitioning
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const key = `${this.config.s3Prefix}/tenant_${businessId}/year=${year}/month=${month}/day=${day}/${fileName}`;
      
      // Upload to S3
      return await this.s3Service.uploadObject({
        bucket: this.config.s3Bucket,
        key,
        body: csvData,
        contentType: 'text/csv'
      });
    } catch (error) {
      return failureFromCatch(error, {
        type: 'YOURCRM_S3_ERROR',
        message: `Failed to upload data to S3 for tenant ${businessId}`
      });
    }
  }
  
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
        crmType: 'yourcrm',
        importType: 'scheduled'
      }
    });
  }
}
```

## Step 6: Create the Factory

Create an `intents-processor.ts` file to export your importer:

```typescript
// packages/publishing/contact-sync/contact-importers/src/importing/your-crm-importer/intent-handler.ts

import { ApplicationContext } from './src/contextProvider';
import { YourCrmImporter } from './src/YourCrmImporter';
import { BatchFileTrackingService } from '@common/framework/batch/publishing/file-tracking/BatchFileTrackingService';
import { S3Service } from '@common/infrastructure/storage/s3Service';

let instance: YourCrmImporter | null = null;

export function getYourCrmImporter(): YourCrmImporter {
  if (!instance) {
    const context = ApplicationContext.getInstance();
    const config = context.getConfig();
    const batchService = new BatchFileTrackingService();
    const s3Service = new S3Service();
    
    instance = new YourCrmImporter(config, batchService, s3Service);
  }
  
  return instance;
}
```

## Step 7: Register Your Importer

Update the adapter registry in `packages/apps/contact-sync/contact-importers/src/adapters/intents-processor.ts`:

```typescript
// packages/publishing/contact-sync/contact-importers/src/importing/intent-handler.ts

import { ICrmAdapter } from '@common/framework/batch/types';
import { getHubspoofImporter } from './hubspoof-importer';
import { getYourCrmImporter } from './your-crm-importer';

// Factory functions for lazy instantiation
const adapterFactories: Record<string, () => ICrmAdapter> = {
  'hubspoof': getHubspoofImporter,
  'yourcrm': getYourCrmImporter  // Add your new importer
};

// Cache for adapter instances
const adapterInstances: Record<string, ICrmAdapter> = {};

export function getAdapter(crmType: string): ICrmAdapter | null {
  if (!adapterFactories[crmType]) {
    return null;
  }
  
  if (!adapterInstances[crmType]) {
    adapterInstances[crmType] = adapterFactories[crmType]();
  }
  
  return adapterInstances[crmType];
}
```

## Step 8: Configure Your Importer

Add configuration parameters to your local environment:

```bash
awslocal ssm put-parameter --name "yourcrm.apiEndpoint" --type "String" --value "http://fake-crm-api:3000/api/v1/yourcrm" --overwrite
awslocal ssm put-parameter --name "yourcrm.s3Prefix" --type "String" --value "exports/yourcrm" --overwrite
```

## Step 9: Add a Test Tenant

Add a test tenant to the database:

```bash
docker exec crmdb crmdb -uroot -proot event -e "INSERT INTO batch_tenants (business_id, crm_type, crm_info, status) VALUES ('67890', 'yourcrm', '{\"apiKey\": \"test-key-67890\", \"endpoint\": \"http://fake-crm-api:3000/api/v1/yourcrm\"}', 'ACTIVE');"
```

## Step 10: Test Your Importer

Run the batch dispatcher and importer to test your implementation:

```bash
# Run the batch dispatcher
npx tsx packages/publishing/contact-sync/dispatcher-bulk/src/intent-handler.ts

# Run the batch importer
npx tsx packages/publishing/contact-sync/contact-importers/src/intent-handler.ts
```

Check the results:

```bash
# Check S3 for uploaded files
awslocal s3 ls s3://crmdata/exports/yourcrm/ --recursive

# Check the batch_files table for recorded files
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, file_path, status FROM batch_files WHERE business_id = '67890' ORDER BY created_at DESC LIMIT 5;"
```

## Best Practices

When creating your own importer, follow these best practices:

1. **Error Handling**: Use the Result pattern consistently
2. **Logging**: Add detailed logs for troubleshooting
3. **Configuration**: Make your importer configurable
4. **Testing**: Write unit tests for your importer
5. **Documentation**: Document your importer's requirements and behavior
6. **Security**: Handle credentials securely
7. **Performance**: Consider batching and pagination for large datasets

## Next Steps

Now that you've created your own importer, proceed to [Testing and Troubleshooting](05-testing-troubleshooting.md) to learn how to test and debug your implementation.
