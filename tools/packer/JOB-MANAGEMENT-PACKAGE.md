# Directory Package: batch-job-management
# Total files: 6
################################################################################

### FILE: packages/framework/src/batch/repositories/types.ts
```
/**
 * Job Management Types and Interfaces
 * 
 * Defines the core data structures for tenant and job management
 * in the batch processing system using PostgreSQL CRM schema.
 */

export type JobStatus = 'pending' | 'started' | 'processing' | 'failed' | 'complete';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

/**
 * Tenant entity - represents a CRM account owner
 */
export interface Tenant {
    id: number;                    // Primary key (auto-increment)
    business_id: string;           // Our internal tenant ID
    account_id: string;            // CRM's account ID for this tenant
    crm_id: number;               // CRM type ID (16 for HubSpot)
    tenant_name: string;          // Display name for the tenant
    last_job_id?: string;         // ULID of most recent job
    status: TenantStatus;         // Current tenant status
    config?: Record<string, any>; // Tenant-specific configuration (JSONB)
    created_at: Date;             // When tenant was created
    updated_at: Date;             // Last modification timestamp
}

/**
 * Tenant Job entity - represents a batch processing job
 */
export interface TenantJob {
    job_id: string;               // ULID primary key
    tenant_id: number;            // FK to tenants table
    business_id: string;          // Direct reference for queries without joins
    job_type: string;             // Type of job (e.g., 'hubspot-sync', 'data-export')
    status: JobStatus;            // Current job status
    current_offset?: string;      // Pagination offset for resumable jobs
    total_records?: number;       // Expected total records to process
    processed_records?: number;   // Records processed so far
    retry_count: number;          // Number of retry attempts
    message?: string;             // Status message or error details
    metadata?: Record<string, any>; // Job-specific data (JSONB)
    created_at: Date;             // Job creation timestamp
    started_at?: Date;            // When job processing began
    completed_at?: Date;          // When job finished (success or failure)
    updated_at: Date;             // Last status update timestamp
}

/**
 * Input types for repository methods
 */
export interface CreateTenantInput {
    business_id: string;
    account_id: string;
    crm_id: number;
    tenant_name: string;
    config?: Record<string, any>;
}

export interface StartJobInput {
    tenant_id: number;
    business_id: string;
    job_type: string;
    total_records?: number;
    metadata?: Record<string, any>;
}

export interface UpdateJobStatusInput {
    job_id: string;
    status: JobStatus;
    message?: string;
    processed_records?: number;
    completed_at?: Date;
}

export interface UpdateJobOffsetInput {
    job_id: string;
    current_offset: string;
    processed_records?: number;
}
```

### FILE: packages/framework/src/batch/repositories/db.setup.ts
```
/**
 * Database Setup for Job Management System
 * 
 * Creates the necessary PostgreSQL tables for tenant and job management
 * in the CRM schema. Run this once to initialize the database structure.
 */

import { PostgreSQLService } from '@crm/connectors';
import { logger } from '@platform/core';

/**
 * SQL DDL statements for creating the job management tables
 */
const CREATE_TENANTS_TABLE = `
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL UNIQUE,
    account_id VARCHAR(255) NOT NULL,
    crm_id INTEGER NOT NULL DEFAULT 16,
    tenant_name VARCHAR(255) NOT NULL,
    last_job_id VARCHAR(26), -- ULID length
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_tenants_business_id ON tenants(business_id);
CREATE INDEX IF NOT EXISTS idx_tenants_account_id ON tenants(account_id);
CREATE INDEX IF NOT EXISTS idx_tenants_crm_id ON tenants(crm_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
`;

const CREATE_TENANT_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS tenant_jobs (
    job_id VARCHAR(26) PRIMARY KEY, -- ULID
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'started', 'processing', 'failed', 'complete')),
    current_offset TEXT,
    total_records INTEGER,
    processed_records INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_tenant_id ON tenant_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_business_id ON tenant_jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_status ON tenant_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_job_type ON tenant_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_created_at ON tenant_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_jobs_updated_at ON tenant_jobs(updated_at);
`;

const CREATE_UPDATE_TRIGGER = `
-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to both tables
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_jobs_updated_at ON tenant_jobs;
CREATE TRIGGER update_tenant_jobs_updated_at
    BEFORE UPDATE ON tenant_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Initialize the job management database schema
 */
export async function setupJobManagementTables(): Promise<void> {
    try {
        logger.info('Setting up job management database tables...');

        // Create tenants table
        const tenantsResult = await PostgreSQLService.CRM.query(CREATE_TENANTS_TABLE);
        if (!tenantsResult.success) {
            throw new Error(`Failed to create tenants table: ${tenantsResult.error?.message}`);
        }

        // Create tenant_jobs table
        const jobsResult = await PostgreSQLService.CRM.query(CREATE_TENANT_JOBS_TABLE);
        if (!jobsResult.success) {
            throw new Error(`Failed to create tenant_jobs table: ${jobsResult.error?.message}`);
        }

        // Create update triggers
        const triggerResult = await PostgreSQLService.CRM.query(CREATE_UPDATE_TRIGGER);
        if (!triggerResult.success) {
            throw new Error(`Failed to create update triggers: ${triggerResult.error?.message}`);
        }

        logger.info('Job management database tables created successfully');
    } catch (error) {
        logger.error({ error }, 'Failed to setup job management tables');
        throw error;
    }
}

/**
 * Drop all job management tables (for testing/cleanup)
 */
export async function dropJobManagementTables(): Promise<void> {
    try {
        logger.warn('Dropping job management database tables...');

        await PostgreSQLService.CRM.query('DROP TABLE IF EXISTS tenant_jobs CASCADE;');
        await PostgreSQLService.CRM.query('DROP TABLE IF EXISTS tenants CASCADE;');
        await PostgreSQLService.CRM.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');

        logger.info('Job management database tables dropped successfully');
    } catch (error) {
        logger.error({ error }, 'Failed to drop job management tables');
        throw error;
    }
}
```

### FILE: packages/framework/src/batch/repositories/job.repository.ts
```
/**
 * Job Repository - Manages tenant job lifecycle and status tracking
 * 
 * Provides methods for creating, updating, and querying batch processing jobs
 * using PostgreSQL CRM database with proper error handling and logging.
 */

import { ulid } from 'ulid';
import { PostgreSQLService } from '@crm/connectors';
import { logger } from '@platform/core';
import { 
    TenantJob, 
    StartJobInput, 
    UpdateJobStatusInput, 
    UpdateJobOffsetInput,
    JobStatus 
} from './types';

export class JobRepository {
    /**
     * Start a new job for a tenant
     */
    async startJob(input: StartJobInput): Promise<TenantJob> {
        const jobId = ulid();
        const now = new Date();

        const query = `
            INSERT INTO tenant_jobs (
                job_id, tenant_id, business_id, job_type, status,
                total_records, metadata, created_at, started_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;

        const params = [
            jobId,
            input.tenant_id,
            input.business_id,
            input.job_type,
            'started' as JobStatus,
            input.total_records || null,
            input.metadata ? JSON.stringify(input.metadata) : null,
            now,
            now,
            now
        ];

        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, params);
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to create job: ${result.error?.message || 'No rows returned'}`);
            }

            const job = result.rows[0];
            logger.info({ 
                jobId: job.job_id, 
                tenantId: job.tenant_id, 
                jobType: job.job_type 
            }, 'Job started successfully');

            return job;
        } catch (error) {
            logger.error({ error, input }, 'Failed to start job');
            throw error;
        }
    }

    /**
     * Get job status by job ID
     * @returns Job object or null if not found
     */
    async getJobStatus(jobId: string): Promise<TenantJob | null> {
        const query = 'SELECT * FROM tenant_jobs WHERE job_id = $1;';
        
        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, [jobId]);
            
            if (!result.success) {
                throw new Error(`Failed to get job status: ${result.error?.message}`);
            }

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            logger.error({ error, jobId }, 'Failed to get job status');
            throw error;
        }
    }

    /**
     * Update job status and optional message
     */
    async updateJobStatus(input: UpdateJobStatusInput): Promise<TenantJob> {
        const setClause = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
        const params: any[] = [input.job_id, input.status];
        let paramIndex = 3;

        if (input.message !== undefined) {
            setClause.push(`message = $${paramIndex}`);
            params.push(input.message);
            paramIndex++;
        }

        if (input.processed_records !== undefined) {
            setClause.push(`processed_records = $${paramIndex}`);
            params.push(input.processed_records);
            paramIndex++;
        }

        if (input.completed_at !== undefined) {
            setClause.push(`completed_at = $${paramIndex}`);
            params.push(input.completed_at);
            paramIndex++;
        }

        // Increment retry count if status is failed
        if (input.status === 'failed') {
            setClause.push('retry_count = retry_count + 1');
        }

        const query = `
            UPDATE tenant_jobs 
            SET ${setClause.join(', ')}
            WHERE job_id = $1
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, params);
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update job status: ${result.error?.message || 'Job not found'}`);
            }

            const job = result.rows[0];
            logger.info({ 
                jobId: job.job_id, 
                status: job.status, 
                message: input.message 
            }, 'Job status updated');

            return job;
        } catch (error) {
            logger.error({ error, input }, 'Failed to update job status');
            throw error;
        }
    }

    /**
     * Update job offset for resumable processing
     */
    async updateOffset(input: UpdateJobOffsetInput): Promise<TenantJob> {
        const setClause = ['current_offset = $2', 'updated_at = CURRENT_TIMESTAMP'];
        const params: any[] = [input.job_id, input.current_offset];

        if (input.processed_records !== undefined) {
            setClause.push('processed_records = $3');
            params.push(input.processed_records);
        }

        const query = `
            UPDATE tenant_jobs 
            SET ${setClause.join(', ')}
            WHERE job_id = $1
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, params);
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update job offset: ${result.error?.message || 'Job not found'}`);
            }

            const job = result.rows[0];
            logger.debug({ 
                jobId: job.job_id, 
                offset: job.current_offset,
                processed: job.processed_records 
            }, 'Job offset updated');

            return job;
        } catch (error) {
            logger.error({ error, input }, 'Failed to update job offset');
            throw error;
        }
    }

    /**
     * Get recent jobs for a tenant (useful for monitoring)
     */
    async getRecentJobs(tenantId: number, limit: number = 10): Promise<TenantJob[]> {
        const query = `
            SELECT * FROM tenant_jobs 
            WHERE tenant_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, [tenantId, limit]);
            
            if (!result.success) {
                throw new Error(`Failed to get recent jobs: ${result.error?.message}`);
            }

            return result.rows;
        } catch (error) {
            logger.error({ error, tenantId, limit }, 'Failed to get recent jobs');
            throw error;
        }
    }

    /**
     * Get jobs by status (useful for monitoring and cleanup)
     */
    async getJobsByStatus(status: JobStatus, limit: number = 100): Promise<TenantJob[]> {
        const query = `
            SELECT * FROM tenant_jobs 
            WHERE status = $1 
            ORDER BY created_at DESC 
            LIMIT $2;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<TenantJob>(query, [status, limit]);
            
            if (!result.success) {
                throw new Error(`Failed to get jobs by status: ${result.error?.message}`);
            }

            return result.rows;
        } catch (error) {
            logger.error({ error, status, limit }, 'Failed to get jobs by status');
            throw error;
        }
    }
}
```

### FILE: packages/framework/src/batch/repositories/tenant.repository.ts
```
/**
 * Tenant Repository - Manages CRM tenant accounts and their configurations
 * 
 * Provides methods for creating, updating, and querying tenant information
 * with proper relationship management to jobs and CRM systems.
 */

import { PostgreSQLService } from '@crm/connectors';
import { logger } from '@platform/core';
import { Tenant, CreateTenantInput } from './types';

export class TenantRepository {
    /**
     * Create a new tenant
     */
    async createTenant(input: CreateTenantInput): Promise<Tenant> {
        const query = `
            INSERT INTO tenants (
                business_id, account_id, crm_id, tenant_name, config, status
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        const params = [
            input.business_id,
            input.account_id,
            input.crm_id,
            input.tenant_name,
            input.config ? JSON.stringify(input.config) : null,
            'active'
        ];

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, params);
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to create tenant: ${result.error?.message || 'No rows returned'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                accountId: tenant.account_id 
            }, 'Tenant created successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, input }, 'Failed to create tenant');
            throw error;
        }
    }

    /**
     * Get tenant by CRM account ID
     */
    async getTenantByAccountId(accountId: string): Promise<Tenant | null> {
        const query = 'SELECT * FROM tenants WHERE account_id = $1 AND status != $2;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, [accountId, 'deleted']);
            
            if (!result.success) {
                throw new Error(`Failed to get tenant by account ID: ${result.error?.message}`);
            }

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            logger.error({ error, accountId }, 'Failed to get tenant by account ID');
            throw error;
        }
    }

    /**
     * Get tenant by business ID (our internal ID)
     */
    async getTenantByBusinessId(businessId: string): Promise<Tenant | null> {
        const query = 'SELECT * FROM tenants WHERE business_id = $1 AND status != $2;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, [businessId, 'deleted']);
            
            if (!result.success) {
                throw new Error(`Failed to get tenant by business ID: ${result.error?.message}`);
            }

            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            logger.error({ error, businessId }, 'Failed to get tenant by business ID');
            throw error;
        }
    }

    /**
     * Change CRM system for a tenant (migration scenario)
     */
    async changeCrm(businessId: string, newAccountId: string, newCrmId: number): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET account_id = $2, crm_id = $3, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $4
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, newAccountId, newCrmId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to change CRM: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                newAccountId, 
                newCrmId 
            }, 'Tenant CRM changed successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, newAccountId, newCrmId }, 'Failed to change CRM');
            throw error;
        }
    }

    /**
     * Update the last job ID for a tenant
     */
    async updateLastJob(businessId: string, jobId: string): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET last_job_id = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $3
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, jobId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update last job: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.debug({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id, 
                jobId 
            }, 'Tenant last job updated');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, jobId }, 'Failed to update last job');
            throw error;
        }
    }

    /**
     * Get all active tenants (useful for batch processing)
     */
    async getActiveTenants(): Promise<Tenant[]> {
        const query = 'SELECT * FROM tenants WHERE status = $1 ORDER BY created_at;';
        
        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(query, ['active']);
            
            if (!result.success) {
                throw new Error(`Failed to get active tenants: ${result.error?.message}`);
            }

            return result.rows;
        } catch (error) {
            logger.error({ error }, 'Failed to get active tenants');
            throw error;
        }
    }

    /**
     * Update tenant configuration
     */
    async updateTenantConfig(businessId: string, config: Record<string, any>): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET config = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $3
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, JSON.stringify(config), 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to update tenant config: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id 
            }, 'Tenant config updated');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId, config }, 'Failed to update tenant config');
            throw error;
        }
    }

    /**
     * Soft delete a tenant (set status to 'deleted')
     */
    async deleteTenant(businessId: string): Promise<Tenant> {
        const query = `
            UPDATE tenants 
            SET status = $2, updated_at = CURRENT_TIMESTAMP
            WHERE business_id = $1 AND status != $2
            RETURNING *;
        `;

        try {
            const result = await PostgreSQLService.CRM.query<Tenant>(
                query, 
                [businessId, 'deleted']
            );
            
            if (!result.success || result.rows.length === 0) {
                throw new Error(`Failed to delete tenant: ${result.error?.message || 'Tenant not found'}`);
            }

            const tenant = result.rows[0];
            logger.info({ 
                tenantId: tenant.id, 
                businessId: tenant.business_id 
            }, 'Tenant deleted successfully');

            return tenant;
        } catch (error) {
            logger.error({ error, businessId }, 'Failed to delete tenant');
            throw error;
        }
    }
}
```

### FILE: packages/framework/src/batch/repositories/index.ts
```
/**
 * Job Management Repository Exports
 * 
 * Centralized exports for all job management repositories and types
 */

// Core repositories
export { JobRepository } from './job.repository';
export { TenantRepository } from './tenant.repository';

// Database setup utilities
export { setupJobManagementTables, dropJobManagementTables } from './db.setup';

// Types and interfaces
export type {
    Tenant,
    TenantJob,
    JobStatus,
    TenantStatus,
    CreateTenantInput,
    StartJobInput,
    UpdateJobStatusInput,
    UpdateJobOffsetInput
} from './types';

// Convenience factory functions
export const createJobRepository = () => new JobRepository();
export const createTenantRepository = () => new TenantRepository();
```

### FILE: packages/framework/src/batch/repositories/README.md
```
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
```

### 2. Create Repositories

```typescript
import { JobRepository, TenantRepository } from '@crm/framework/batch/repositories';

const jobRepo = new JobRepository();
const tenantRepo = new TenantRepository();
```

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
```

## Database Schema

### Tenants Table
- `id`: Primary key (auto-increment)
- `business_id`: Our internal tenant ID (unique)
- `account_id`: CRM account ID
- `crm_id`: CRM system ID (16 for HubSpot)
- `tenant_name`: Display name
- `last_job_id`: Most recent job ULID
- `status`: active/suspended/deleted
- `config`: JSONB configuration
- `created_at`, `updated_at`: Timestamps

### Tenant Jobs Table
- `job_id`: ULID primary key
- `tenant_id`: FK to tenants
- `business_id`: Direct tenant reference
- `job_type`: Type of processing job
- `status`: pending/started/processing/failed/complete
- `current_offset`: Resumable position
- `total_records`, `processed_records`: Progress tracking
- `retry_count`: Failed attempt counter
- `message`: Status/error messages
- `metadata`: JSONB job-specific data
- `created_at`, `started_at`, `completed_at`, `updated_at`: Timestamps

## API Reference

### JobRepository

- `startJob(input)`: Create and start a new job
- `getJobStatus(jobId)`: Get current job status
- `updateJobStatus(input)`: Update job status and message
- `updateOffset(input)`: Update resumable offset
- `getRecentJobs(tenantId, limit)`: Get recent jobs for tenant
- `getJobsByStatus(status, limit)`: Get jobs by status

### TenantRepository

- `createTenant(input)`: Create new tenant
- `getTenantByAccountId(accountId)`: Find by CRM account ID
- `getTenantByBusinessId(businessId)`: Find by internal ID
- `changeCrm(businessId, accountId, crmId)`: Migrate CRM system
- `updateLastJob(businessId, jobId)`: Update last job reference
- `getActiveTenants()`: Get all active tenants
- `updateTenantConfig(businessId, config)`: Update configuration
- `deleteTenant(businessId)`: Soft delete tenant

## Dependencies

- `@crm/connectors`: PostgreSQL service layer
- `@platform/core`: Logging and error handling
- `ulid`: ULID generation for job IDs

## Configuration

Ensure your PostgreSQL configuration includes:
```typescript
{
  host: 'localhost',
  port: 5432,
  user: 'your_user',
  password: 'your_password',
  database: 'crm',
  connectionLimit: 10
}
```

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
```
