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
