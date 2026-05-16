/**
 * Job Repository - Manages tenant job lifecycle and status tracking
 * 
 * Provides methods for creating, updating, and querying batch processing jobs
 * using PostgreSQL CRM database with proper error handling and logging.
 */

import { ulid } from 'ulid';
import { PostgreSQLService } from '@platform/connectors';
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
