# Setting Up and Running a Batch Importer

This guide walks you through setting up and running a CRM-specific batch importer in the Blueprint framework.

## What is a Batch Importer?

A batch importer is a CRM-specific application that:
- Calls the CRM's batch export API for one tenant at a time
- Waits for the export job to be completed
- Downloads the exported files and writes them to S3
- Registers the files in the batch processing system

Each CRM (like GoHio or Hubspoof) has its own batch importer implementation that extends the common `BaseExporter` class.

## Blueprint Batch Processing System Overview

The Blueprint framework includes a robust batch processing system that handles data from various CRM systems. The system consists of three main components:

1. **Batch Importers**: CRM-specific applications that download data from CRMs and store it in S3
2. **File Discovery Service**: Detects new files in S3 and updates the work queue in the database
3. **File Processors**: Process the files from the work queue and load data into Elasticsearch

This guide focuses on the first component: the batch importers.

## Prerequisites

Before running a batch importer, ensure you have:

1. Docker environment running with all required services
2. Shared configuration parameters loaded in AWS Parameter Store
3. S3 bucket seeded with the necessary directory structure
4. Tenant records in the `batch_tenants` table for the CRM you're working with

## Step 1: Seed S3 and Parameter Store

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

You can run either the GoHio or Hubspoof batch importer:

### GoHio Batch Importer

```bash
# Run the GoHio batch importer
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
npx tsx packages/publishing/crm/gohio/batch-importer/src/GoHioExporter.ts
```

### Hubspoof Batch Importer

```bash
# Run the Hubspoof batch importer
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
npx tsx packages/publishing/crm/hubspooof/batch-importer/src/HubspoofExporter.ts
```

> 🤖 **Cascade Automation**: `/demo-batch-import` - Runs the Hubspoof batch importer and verifies the results

## Step 3: Check for Files in S3

After running the batch importer, verify that files were successfully uploaded to S3:

```bash
# List files in the S3 bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://crmdata/exports/ --recursive
```

You should see files with a structure like:
```
s3://crmdata/exports/{crm}/{tenant_id}/year={year}/month={month}/day={day}/{filename}
```

For example:
```
s3://crmdata/exports/gohio/tenant_12345/year=2025/month=06/day=25/batch-import_20250625T162030.jsonl
```

## Step 4: Check the Database for Tasks

Verify that the batch importer registered the files in the `batch_files` table:

```bash
# Connect to MySQL
crmdb -h localhost -P 3307 -u root -ppassword blueprint

# Query the batch_files table
SELECT * FROM batch_files ORDER BY created_at DESC LIMIT 10;
```

You should see records with:
- `business_id`: The tenant ID
- `file_path`: The S3 path to the downloaded file
- `status`: "DOWNLOADED" if successful

> 🤖 **Cascade Automation**: `/demo-batch-process` - Processes the imported files through the batch processing pipeline

## Understanding the Batch Importer Code

The batch importers follow a common pattern:

1. They extend the `BaseExporter` class which provides common functionality
2. They implement three key methods:
   - `getTenants()`: Retrieves tenants from the database
   - `downloadOneTenant()`: Processes a single tenant
   - `run()`: Orchestrates the entire batch process

The importers use the Result pattern for error handling, with `success()` and `failure()` functions to return results.

## Running the Demo

To see the complete batch processing pipeline in action, you can use Cascade to run a demo workflow. The demo is broken into separate steps that you can execute using slash commands:

### Step 1: Initialize the Environment (`/demo-batch-init`)

This step ensures your environment is properly set up:
- Verifies that Docker services are running (MySQL, LocalStack, Elasticsearch, etc.)
- Seeds the S3 bucket with the initial directory structure
- Checks that the database tables are properly initialized

```
/demo-batch-init
```

### Step 2: Run the Batch Importer (`/demo-batch-import`)

This step runs the Hubspoof batch importer to download data from the CRM and store it in S3:
- Retrieves tenants from the `batch_tenants` table
- For each tenant, creates an export job with the CRM API
- Downloads the exported file when ready
- Uploads the file to S3 with proper date partitioning
- Registers the file in the `batch_files` table with status "DOWNLOADED"

```
/demo-batch-import
```

### Step 3: Process the Imported Files (`/demo-batch-process`)

This step processes the imported files:
- Reads files with status "DOWNLOADED" from the `batch_files` table
- Processes the file contents based on the CRM-specific format
- Loads the data into Elasticsearch
- Updates the file status to "PROCESSED"

```
/demo-batch-process
```

### Step 4: Verify the Results (`/demo-batch-verify`)

This step verifies that the data was properly processed:
- Queries Elasticsearch to check for the processed data
- Verifies that all files have been processed
- Shows sample data from the processed files

```
/demo-batch-verify
```

Each step builds on the previous one, demonstrating the complete batch processing pipeline from data import to processing and verification.

## Next Steps

After running the batch importer:
1. The file discovery service will detect the new files
2. The file processor will process the files and update Elasticsearch
3. You can query Elasticsearch to see the processed data

For more details on these next steps, see the File Discovery and File Processing guides.
