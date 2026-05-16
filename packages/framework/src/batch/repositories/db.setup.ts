/**
 * Database Setup for Job Management System
 * 
 * Creates the necessary PostgreSQL tables for tenant and job management
 * in the CRM schema. Run this once to initialize the database structure.
 */

import { PostgreSQLService } from '@platform/connectors';
import { logger } from '@platform/core';

const CREATE_SCHEMA = `CREATE SCHEMA IF NOT EXISTS crm;`;

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
        const databaseResult = await PostgreSQLService.CRM.query(CREATE_TENANTS_TABLE);
        if (!databaseResult.success) {
            throw new Error(`Failed to create tenants table: ${databaseResult.error?.message}`);
        }


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
