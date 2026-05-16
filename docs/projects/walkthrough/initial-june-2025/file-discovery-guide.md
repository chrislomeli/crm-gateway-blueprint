# File Discovery Service Guide

This guide walks you through understanding and running the file discovery service in the Blueprint framework.

## What is the File Discovery Service?

**Important: This is a core framework service that works out-of-the-box with any CRM integration and requires no additional development effort when setting up a new CRM.**

The file discovery service is the second component in the Blueprint batch processing pipeline. It:

- Scans S3 for new files that were uploaded by batch importers **or other sources like webhooks**
- Processes files for all tenants of a specific CRM
- Counts rows in each file and updates file metadata
- Updates the `batch_files` table, which serves as a work queue for file processors
- Tracks the last processed date for each tenant

The file discovery service bridges the gap between batch importers (which create files) and file processors (which consume and process those files).

## How the File Discovery Service Works

The file discovery service follows these steps:

1. **Tenant Discovery**: Retrieves all tenants from the `batch_tenants` table
2. **File Scanning**: For each tenant, scans S3 for files in the tenant's directory
3. **Incremental Processing**: Processes files month by month, starting from the last processed date
4. **Row Counting**: Counts rows in each file to update metadata
5. **File Registration**: 
   - For **existing files** (already in the `batch_files` table): Updates metadata like row counts
   - For **new files** (added through webhooks or other means): Creates new entries in the `batch_files` table
6. **Date Tracking**: Updates the tenant's last processed date

The service is designed to be idempotent, meaning it can be run multiple times without duplicating work or causing issues.

## Prerequisites

Before running the file discovery service, ensure you have:

1. Docker environment running with all required services
2. Shared configuration parameters loaded in AWS Parameter Store
3. S3 bucket with files uploaded by batch importers
4. Tenant records in the `batch_tenants` table

**Note: This guide assumes you have already completed the Batch Importer walkthrough, which creates the initial files and database records needed for this demo.**

## Step 1: Ensure Environment is Ready

First, make sure your environment is properly set up:

```bash
# Start Docker environment if not already running
cd environments/local
./fresh-restart.sh

# Deploy shared configuration to Parameter Store
bash packages/tools/dev-bootstrap/config-manager.sh deploy-shared -e local -f packages/tools/dev-bootstrap/config/shared-config.yaml

# Seed S3 bucket with initial structure
bash packages/tools/dev-bootstrap/seed-s3-local.sh
```

> 🤖 **Cascade Automation**: `/demo-batch-init` - Initializes the batch processing environment

## Step 2: Run a Batch Importer

**Note: You can skip this step if you have already run the batch importer demo (`/demo-batch-import`) and have files in S3. The file discovery service needs files to discover, but it doesn't matter when those files were created.**

Before running the file discovery service, you need files in S3. Run a batch importer to create these files:

```bash
# Run the Hubspoof batch importer
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
npx tsx packages/publishing/crm/hubspooof/batch-importer/src/HubspoofExporter.ts
```

> 🤖 **Cascade Automation**: `/demo-batch-import` - Runs the Hubspoof batch importer and verifies the results

## Step 3: Check Current State Before Discovery

Before running the file discovery service, let's check the current state of the S3 bucket and the batch_files table:

```bash
# Check files in S3
aws --endpoint-url=http://localhost:4566 s3 ls s3://crmdata/exports/hubspoof/ --recursive | sort -r | head -n 6

# Check batch_files table
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, file_path, total_records, status FROM batch_files ORDER BY created_at DESC LIMIT 6;"
```

You should see:
- Files in S3 with proper date partitioning (year/month/day)
- Entries in the batch_files table with `total_records` set to 0 and status "DOWNLOADED"

## Step 4: Run the File Discovery Service

Now you can run the file discovery service to scan for new files and update metadata:

```bash
# Run the file discovery service
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
npx tsx packages/publishing/contact-sync/file-reader/src/intent-handler.ts
```

> 🤖 **Cascade Automation**: `/demo-batch-discover` - Runs the file discovery service to scan for new files

During execution, you'll see logs showing:
- Tenant processing (e.g., "SWEEPING FILES FOR TENANT 5678 - CRM hubspoof")
- Month-by-month scanning (e.g., "Checking S3 for files with prefix: hubspoof/tenant_05678/year=2025/month=06/")
- File discovery (e.g., "Found 1 files for 2025-06")
- Row counting (e.g., "Counted rows in file: 5")
- Database updates (e.g., "Registered files for month")
- Tenant date updates (e.g., "Updated tenant last processed date")

## Step 5: Check for Updated File Metadata

After running the file discovery service, verify that the file metadata was updated in the database:

```bash
# Check batch_files table after discovery
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, file_path, total_records, status, updated_at FROM batch_files ORDER BY updated_at DESC LIMIT 6;"
```

You should see changes in the batch_files table:
- `total_records` field updated from 0 to the actual row count (e.g., 5)
- Status may change from "DOWNLOADED" to "PENDING" to indicate files are ready for processing
- `updated_at` timestamp showing when the file discovery service ran

## What We've Learned

The file discovery service demonstrates several key concepts:

1. **Dual Functionality**:
   - Updates existing files that were already registered by batch importers
   - Discovers and registers new files that were added through other means

2. **Incremental Processing**:
   - Processes files month by month, starting from the last processed date
   - Updates tenant's last processed date for future runs

3. **Metadata Enhancement**:
   - Counts rows in each file to provide accurate metadata
   - Updates status to indicate files are ready for processing

4. **Pipeline Integration**:
   - Bridges the gap between batch importers and file processors
   - Maintains the batch_files table as a work queue for processing

## Next Steps

After running the file discovery service:
1. The file processor will pick up files with status "PENDING"
2. The file processor will process the files and update Elasticsearch
3. You can query Elasticsearch to see the processed data

> 🤖 **Cascade Automation**: `/demo-batch-process` - Processes the discovered files

For more details on these next steps, see the File Processing guide.
