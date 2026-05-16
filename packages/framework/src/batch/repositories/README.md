# Job Management System

A comprehensive PostgreSQL-based job management solution for batch processing with tenant isolation.

## Overview

This system provides:
- **Tenant Management**: Track CRM accounts and their configurations
- **Job Lifecycle**: Create, monitor, and update batch processing jobs
- **Progress Tracking**: Resume jobs from specific offsets with progress monitoring
- **Error Handling**: Retry logic and comprehensive error tracking
- **Multi-tenant**: Isolated processing per tenant with proper indexing

## Quick Start

### 1. Database Setup

```typescript
import { setupJobManagementTables } from '@crm/framework/batch/repositories';

// Initialize database tables (run once)
await setupJobManagementTables();

### 3. Basic Usage

```typescript
// Create a tenant
const tenant = await tenantRepo.createTenant({
    business_id: 'tenant-123',
    account_id: 'hubspot-456',
    crm_id: 16,
    tenant_name: 'Acme Corp'
});

// Start a job
const job = await jobRepo.startJob({
    tenant_id: tenant.id,
    business_id: tenant.business_id,
    job_type: 'hubspot-sync',
    total_records: 1000
});

// Update job progress
await jobRepo.updateOffset({
    job_id: job.job_id,
    current_offset: 'page_2',
    processed_records: 250
});

// Complete the job
await jobRepo.updateJobStatus({
    job_id: job.job_id,
    status: 'complete',
    message: 'Successfully processed all records',
    completed_at: new Date()
});

## Error Handling

All methods use proper error handling with:
- Structured logging via `@platform/core`
- Detailed error messages
- Transaction safety where applicable
- Proper cleanup on failures

## Testing

The system includes:
- Database setup/teardown utilities
- Repository reset methods for testing
- Comprehensive error scenarios
- Multi-tenant isolation validation
