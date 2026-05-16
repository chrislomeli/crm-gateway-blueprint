# Environment Setup for Batch Importers

**🚀 Interactive Walkthrough - Execute Each Step!**

This is a hands-on guide where you'll run each command step-by-step to set up your local development environment for Blueprint batch importers. Make sure to execute each command in order.

This guide will walk you through setting up your local development environment for working with Blueprint batch importers.

## Prerequisites

Before you begin, make sure you have:

- Docker Desktop installed
- AWS CLI installed
- Node.js 16+ and npm installed

## Step 1: Install awslocal

**→ Run this command to install awslocal:**

The `awslocal` tool is a wrapper around the AWS CLI that automatically configures endpoints for LocalStack. Install it using pip:

```bash
pip install awscli-local
```

## Step 2: Update Your Hosts File

**→ Add these entries to your hosts file:**

To ensure proper communication between your local machine and the Docker containers, add the following entries to your hosts file:

```
127.0.0.1 localstack
127.0.0.1 mysql
127.0.0.1 elasticsearch
```

On macOS and Linux, you can edit the hosts file with:

```bash
sudo nano /etc/hosts
```

On Windows, edit `C:\Windows\System32\drivers\etc\hosts` as an administrator.

## Step 3: Start the Local Environment

**→ Execute these commands to start the Docker environment:**

The local environment is defined in the `docker-compose.yaml` file. It includes:

- LocalStack (for AWS services like S3, SQS, and Parameter Store)
- MySQL (for database storage)
- Elasticsearch (for search capabilities)
- Bootstrap service (for initializing resources)

To start the environment:

```bash
cd /Users/clomeli/Source/acme/projects/blueprint/blue-demo
docker-compose -f infrastructure/local/docker/docker-compose.yaml down -v
docker-compose -f infrastructure/local/docker/docker-compose.yaml up -d
```

> **Note:** You don't need to build the containers using `docker-compose build` unless you make changes to the 'fake-crm-api' or 'bootstrap' containers. The standard `docker-compose up` command will pull pre-built images from the registry.

### What These Commands Do:

- `docker-compose down -v`: Stops and removes all containers, networks, and volumes defined in the docker-compose file
- `docker-compose up -d`: Starts all services defined in the docker-compose file in detached mode (running in the background)

## Step 4: Verify Services Are Running

**→ Check that all services started successfully:**

Check that all required services are running:

```bash
docker ps
```

You should see containers for:
- localstack
- mysql
- elasticsearch
- bootstrap (this automatically sets up the required AWS resources like parameter-store and SQS queues)
- fake-crm-api (this serves as a mock CRM for testing purposes)

> **Note:** I recommend using the `docker desktop` instead of Docker ps, but both are available.  Docker ps allows you to scroll through the list of running containers and inspect their logs



## Step 5: Verify AWS Resources

**→ Run these commands to verify the AWS resources were created:**

The bootstrap service automatically creates required AWS resources in LocalStack. Verify they exist.   Don't expect these to come up immediately - the bootstrapper has to go through it's own cold start, create the reocurces and seed their values

### Check S3 Buckets:

**→ List the S3 buckets:**

```bash
awslocal s3 ls
```

You should see the `crmdata` and `temp` buckets.

### Check S3 Bucket Contents:

**→ Verify the buckets are initially empty:**

The buckets should be empty except for any readme files:

```bash
# Check crmdata bucket contents
awslocal s3 ls s3://crmdata/ --recursive

# Check temp bucket contents  
awslocal s3 ls s3://temp/ --recursive
```

Expected output: The buckets should be empty or contain only readme.md files at this point.

### Check SQS Queues:

**→ List the SQS queues:**

```bash
awslocal sqs list-queues
```

You should see the `batch-dispatcher-queue` and `batch-processing-queue`.

### Check Parameter Store:

```bash
awslocal ssm describe-parameters
```

You should see various configuration parameters.

## Step 6: Verify Database Setup

**→ Check that the database tables are properly initialized:**

Check that the database tables are properly initialized:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SHOW TABLES;"
```

You should see tables including `batch_tenants` and `batch_files`.

Check the tenant data:

```bash
docker exec crmdb crmdb -uroot -proot event -e "SELECT id, business_id, crm, status FROM batch_tenants;"
```

## Step 7: Adding Your Own Tenant Data

**→ Modify the seed file to add your own tenant data:**

To add your own tenants for testing, you can modify the seed file at `infrastructure/local/docker/mysql/init/05-batch-seed-tenants.sql`. This file contains the initial tenant data that gets loaded when the MySQL container is initialized.

Here's an example of the tenant data structure:

```sql
insert into event.batch_tenants (id, business_id, business_prefix, crm, crm_info, file_format, status, created_at, updated_at)
values  (6, 99999, 'tenant_99999', 'hubspoof', 
        '{"api_key": "!ssm<tenant_99999>[apiKey]", "client_id": "!ssm<tenant_99999>[clientId]"}', 
        'csv', 'PROCESSING', NOW(), NOW());
```

Key fields to customize:
- `id`: Unique identifier for the tenant record (must be unique)
- `business_id`: Your tenant's business ID (numeric)
- `business_prefix`: String prefix used for file naming (typically 'tenant_' followed by the business_id with leading zeros)
- `crm`: CRM type ('gohio' or 'hubspoof' are currently supported)
- `crm_info`: JSON object with API credentials - references SSM parameter store values
- `file_format`: The expected format of files ('csv' or 'jsonl')
- `status`: Initial status (typically 'PROCESSING')

After modifying the seed file, you'll need to restart the environment for changes to take effect:

```bash
# Bring down the environment (this will delete all data)
docker-compose -f infrastructure/local/docker/docker-compose.yaml down -v

# Start it again with your updated tenant data
docker-compose -f infrastructure/local/docker/docker-compose.yaml up -d
```

## Step 8: IDE Setup (Optional)

**→ Configure your IDE to connect to the MySQL database:**

If you want to view the MySQL data directly from your IDE, you can connect using:

- Connection URL: `jdbc:mysql://localhost:3307`
- Username: `root`
- Password: `root`
- Database: `event`

## Troubleshooting

### Services Not Starting

**→ Check the logs for errors:**

If services fail to start, check the logs:

```bash
docker-compose -f infrastructure/local/docker/docker-compose.yaml logs
```

For a specific service:

```bash
docker-compose -f infrastructure/local/docker/docker-compose.yaml logs [service-name]
```

### Resource Creation Issues

**→ Run the bootstrap script manually:**

If AWS resources aren't created properly, you can manually run the bootstrap script:

```bash
npx tsx packages/tools/dev-bootstrap/bootstrap-unified.ts
```

### Port Conflicts

**→ Check for port conflicts:**

If you see errors about ports being in use, make sure no other services are using the required ports (3307 for MySQL, 4566 for LocalStack, etc.).

## Next Steps

Now that your environment is set up, proceed to [Tenant Configuration](02-tenant-configuration.md) to learn how to configure batch tenants.
