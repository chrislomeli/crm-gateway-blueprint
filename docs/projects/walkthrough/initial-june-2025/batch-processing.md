# Batch Processing in Blueprint

This document provides a comprehensive guide to the batch processing system in the Blueprint framework. We'll walk through each phase of the batch processing workflow, from importing data from CRMs to processing files and updating Elasticsearch.

## Batch Processing Overview

Batch processing in Blueprint consists of three main phases:

1. **Batch Importer**: Gets a bulk download from the CRM and loads it directly to S3
2. **File Discovery**: One container per CRM that updates the work queue (`batch_files` table) with any new files
3. **File Processor**: One processor per CRM that reads new files and processes them (into Elasticsearch)

The system uses the `batch_tenants` table to track which tenants need this service.

## Step 1: Create a Batch Importer

The Batch Importer is responsible for getting a batch download from the CRM and downloading it to S3. There's one of these applications per CRM integration.

### Prerequisites

Before setting up a Batch Importer, ensure:

- The `crmdata` bucket exists in S3 and has the prefix `exports` (bootstrapped via `packages/tools/dev-bootstrap/seed-s3-local.sh`)
- Shared parameters and secrets are loaded into AWS Parameter Store
- The container for the CRM (e.g., Hubspoof) is deployed (TBD)
- There is a row in the `batch_tenants` table for each tenant (business ID) that needs to sync

### Implementation Example

The `SampleExporter` class in `packages/apps/crm/hubspooof/batch-importer/src/SampleExporter.ts` demonstrates how to implement a Batch Importer:

```typescript
export class SampleExporter extends BaseExporter {
    private readonly crm: string = 'hubspoof';
    private readonly mockDataFile: string = path.join(__dirname, 'mock-data', 'contacts.csv');
    private tenants: TenantInfo[] = [];

    constructor(bucket: string = "crmdata", prefix: string = "exports") {
        super(bucket, prefix);
    }

    async getTenants(): Promise<Result<TenantInfo[]>> {
        // Get all tenants from the batch_tenant table where crm_type = this.crm
        // ...
    }

    async downloadOneTenant(tenant: ServiceTenantInfo): Promise<Result<string>> {
        // 1. Request batch import from CRM
        // 2. Poll for results
        // 3. Download the file to S3
        // ...
    }

    async run(): Promise<Result<BatchRunResult>> {
        // Process all tenants
        // ...
    }
}
```

### Running the Batch Importer

To run the Batch Importer locally:

```bash
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
npx tsx packages/publishing/crm/hubspooof/batch-importer/src/SampleExporter.ts
```

This will:
1. Initialize the configuration provider
2. Retrieve export configuration from Parameter Store
3. Create a `SampleExporter` instance
4. Process all tenants for the specified CRM
5. Download data and upload it to S3 with proper date partitioning

### S3 Storage Structure

Files are stored in S3 with the following structure:

```
s3://crmdata/exports/{crm}/{tenant_id}/year={year}/month={month}/day={day}/{filename}
```

For example:
```
s3://crmdata/exports/hubspoof/tenant_05678/year=2025/month=06/day=25/batch-import_20250625T024523.csv
```

## Step 2: File Discovery

The File Discovery service is responsible for scanning S3 for new files and updating the work queue (`batch_files` table) with information about these files.

### Implementation

Each CRM has its own File Discovery container that:
1. Periodically scans the S3 bucket for new files
2. Compares files against the `batch_files` table to identify new ones
3. Adds new files to the work queue with status "pending"

## Step 3: File Processing

The File Processor service reads files from the work queue and processes them, typically loading the data into Elasticsearch.

### Implementation

Each CRM has its own File Processor that:
1. Polls the `batch_files` table for files with status "pending"
2. Downloads and processes these files
3. Updates file status to "processed" upon completion
4. Handles errors and retries as needed

## Database Schema

### batch_tenants Table

This table tracks which tenants need batch processing services:

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| business_id | VARCHAR | Tenant business ID |
| crm | VARCHAR | CRM type (e.g., "hubspoof") |
| business_prefix | VARCHAR | Prefix for the tenant |
| enabled | BOOLEAN | Whether batch processing is enabled |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### batch_files Table

This table serves as the work queue for file processing:

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| business_id | VARCHAR | Tenant business ID |
| file_path | VARCHAR | S3 file path |
| file_path_hash | VARCHAR | Hash of the file path for quick lookups |
| status | VARCHAR | File status (pending, processing, processed, error) |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |
| error | TEXT | Error message if processing failed |

## Troubleshooting

If you encounter issues during batch processing:

- Check that the `crmdata` bucket exists in S3
- Verify that tenant records exist in the `batch_tenants` table
- Ensure the CRM container is running and accessible
- Check logs for any errors during the import or processing phases
- Verify that AWS Parameter Store contains the necessary configuration

For more detailed information, refer to the Blueprint framework documentation.
