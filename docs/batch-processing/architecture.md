# Batch Processing Architecture

## System Overview

The batch processing system is designed as a modern, Kubernetes-native architecture that orchestrates CRM data imports across multiple tenants. The system follows a microservices pattern with clear separation of concerns.

## Architecture Decisions

### CronJob vs Deployment
**Decision**: Use CronJob for batch-dispatcher
**Rationale**: 
- Batch processing is naturally scheduled work
- Kubernetes provides enterprise-grade scheduling "for free"
- No resource consumption between runs
- Built-in failure tracking and history

### Configuration Layering
**Pattern**: 3-layer configuration architecture
```
1. Shared Infrastructure (k8s/shared/) - SQS queues, S3 buckets, database endpoints
2. Environment Config (k8s/local/) - Environment-specific settings, AWS endpoints
3. App-Specific Config (k8s/local/) - Service-specific settings, timeouts, limits
```

**Benefits**:
- Clear separation of concerns
- Easy environment switching
- Helm-template ready
- Reusable infrastructure configs

## Service Patterns

### Modern Batch-Loader Service Template
```typescript
// Modern entrypoint pattern
async function main() {
    console.log('Initializing [Service Name]...');
    
    try {
        // Initialize configuration (works locally and in containers)
        await ConfigProvider.initialize();
        console.log('Configuration initialized');
        
        // Run the service logic
        await runService();
    } catch (error) {
        console.error('Failed to start service:', error);
        process.exit(1);
    }
}
```

**Key Characteristics**:
- Single entrypoint (e.g., `dispatcher.app.ts`)
- Modern config loading (`ConfigProvider.initialize()`)
- Local/container compatible (no environment-specific logic)
- Clean dependencies (only what's actually used)
- No legacy code

## Production Stack Progression

```
Phase 1: Raw K8s YAML (Current)
├── Local development and testing
├── Pattern establishment
└── Proof of concept

Phase 2: Helm Charts (Next)
├── Templating and parameterization
├── Environment-specific values
└── Package management

Phase 3: Terraform + Helm (Production)
├── Infrastructure as Code
├── Automated provisioning
└── GitOps workflow

Phase 4: GitHub Actions (CI/CD)
├── Automated deployments
├── Testing pipelines
└── Release management
```

## Component Architecture

### Batch Dispatcher
- **Type**: CronJob (scheduled execution)
- **Purpose**: Orchestrates batch import jobs for tenants
- **Schedule**: Every 5 minutes (configurable)
- **Responsibilities**:
  - Scan for tenants needing processing
  - Dispatch import jobs to SQS
  - Update tenant processing status
  - Handle tenant locking and heartbeats

### Batch Importers
- **Type**: SQS Workers (event-driven)
- **Purpose**: Process specific CRM data imports
- **Trigger**: SQS messages from dispatcher
- **Responsibilities**:
  - Download files from CRM APIs
  - Transform data to standard format
  - Upload processed files to S3
  - Update processing status

### File Discovery
- **Type**: CronJob or SQS Worker
- **Purpose**: Discover new files for processing
- **Responsibilities**:
  - Scan S3 buckets for new files
  - Queue files for processing
  - Track file processing state

### File Processors
- **Type**: SQS Workers
- **Purpose**: Process discovered files
- **Responsibilities**:
  - Parse and validate file contents
  - Apply business rules and transformations
  - Store processed data
  - Generate reports and notifications

## Data Flow

```
1. Batch Dispatcher (CronJob)
   ├── Scans batch_tenants table
   ├── Identifies tenants needing processing
   └── Publishes messages to SQS

2. Batch Importers (SQS Workers)
   ├── Receive tenant processing messages
   ├── Download data from CRM APIs
   ├── Upload files to S3
   └── Update batch_files table

3. File Discovery (CronJob)
   ├── Scans S3 for new files
   ├── Updates batch_files table
   └── Publishes file processing messages

4. File Processors (SQS Workers)
   ├── Receive file processing messages
   ├── Process file contents
   ├── Store results
   └── Update processing status
```

## Database Schema

### batch_tenants
- Tenant configuration and status
- CRM credentials and API info
- Processing locks and heartbeats
- File processing statistics

### batch_files
- File processing tracking
- Status and error information
- Processing timestamps
- Record counts and statistics

### job_definitions (File Generator)
- Job specifications and schedules
- Tenant-specific configurations
- Enable/disable flags

### job_runs (File Generator)
- Job execution tracking
- Results and error information
- S3 URLs for generated files

## Infrastructure Components

### Message Queues (SQS)
- `batch-processing-queue` - Tenant processing messages
- `batch-import-queue` - Import job messages
- `file-discovery-queue` - File discovery messages
- `notification-queue` - Status notifications
- `dead-letter-queue` - Failed message handling

### Object Storage (S3)
- `batch-files-bucket` - Raw CRM data files
- `processed-files-bucket` - Processed and transformed files
- `reports-bucket` - Generated reports and outputs

### Databases
- **MySQL/PostgreSQL** - Flexible database backend
- **Connection Pooling** - Efficient resource utilization
- **Transaction Support** - Data consistency
- **Migration Support** - Schema evolution
