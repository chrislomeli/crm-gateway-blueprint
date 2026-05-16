// import {PostgreSQLService} from '@platform/connectors';
import {CreateJobDefinitionRequest, CreateJobRunRequest, JobDefinition, JobRun} from './types';
import {v4 as uuidv4} from 'uuid';
import {PostgreSQLService} from "@platform/connectors";


export class JobRepository {
    constructor(private dbClient: PostgreSQLService) {
    }

    async initializeTables(): Promise<void> {
        // Create job_definitions table
        await this.dbClient.query(`
      CREATE TABLE IF NOT EXISTS job_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name TEXT NOT NULL,
        job_spec JSONB NOT NULL,
        schedule TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` as string);

        // Create job_runs table
        await this.dbClient.query(`
            CREATE TABLE IF NOT EXISTS job_runs
            (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_definition_id UUID NOT NULL REFERENCES job_definitions(id),
                tenant_id UUID NOT NULL,
                trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('api', 'scheduled', 'manual')),
                status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                s3_url        TEXT,
                error_message TEXT,
                started_at    TIMESTAMP,
                completed_at  TIMESTAMP,
                created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
            )
        ` as string);

        // Create indexes for performance
        await this.dbClient.query(`
            CREATE INDEX IF NOT EXISTS idx_job_definitions_tenant_id ON job_definitions(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_job_definitions_enabled ON job_definitions(enabled);
            CREATE INDEX IF NOT EXISTS idx_job_runs_tenant_id ON job_runs(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_job_runs_job_definition_id ON job_runs(job_definition_id);
            CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
            CREATE INDEX IF NOT EXISTS idx_job_runs_created_at ON job_runs(created_at);
        ` as string);

        console.log('Job tables initialized successfully');
    }

    // Job Definition Management
    async createJobDefinition(request: CreateJobDefinitionRequest): Promise<JobDefinition> {
        const id = uuidv4();
        const now = new Date();

        const result = await this.dbClient.query(
            `INSERT INTO job_definitions (id, tenant_id, name, job_spec, schedule, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
            [id, request.tenant_id, request.name, JSON.stringify(request.job_spec),
                request.schedule, request.enabled ?? true, now, now]
        );

        return this.mapRowToJobDefinition(result.rows[0]);
    }

    async getJobDefinition(id: string): Promise<JobDefinition | null> {
        const result = await this.dbClient.query(
            'SELECT * FROM job_definitions WHERE id = $1',
            [id]
        );

        return result.rows.length > 0 ? this.mapRowToJobDefinition(result.rows[0]) : null;
    }

    async getJobDefinitionsByTenant(tenantId: string): Promise<JobDefinition[]> {
        const result = await this.dbClient.query(
            'SELECT * FROM job_definitions WHERE tenant_id = $1 ORDER BY created_at DESC',
            [tenantId]
        );

        return result.rows.map((row: { [key: string]: any }) => this.mapRowToJobDefinition(row));
    }

    async updateJobDefinition(id: string, updates: Partial<CreateJobDefinitionRequest>): Promise<JobDefinition | null> {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            setClauses.push(`name = $${paramIndex++}`);
            values.push(updates.name);
        }
        if (updates.job_spec !== undefined) {
            setClauses.push(`job_spec = $${paramIndex++}`);
            values.push(JSON.stringify(updates.job_spec));
        }
        if (updates.schedule !== undefined) {
            setClauses.push(`schedule = $${paramIndex++}`);
            values.push(updates.schedule);
        }
        if (updates.enabled !== undefined) {
            setClauses.push(`enabled = $${paramIndex++}`);
            values.push(updates.enabled);
        }

        if (setClauses.length === 0) {
            return this.getJobDefinition(id);
        }

        setClauses.push(`updated_at = $${paramIndex++}`);
        values.push(new Date());
        values.push(id);

        const result = await this.dbClient.query(
            `UPDATE job_definitions SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        return result.rows.length > 0 ? this.mapRowToJobDefinition(result.rows[0]) : null;
    }

    async deleteJobDefinition(id: string): Promise<boolean> {
        const result = await this.dbClient.query(
            'DELETE FROM job_definitions WHERE id = $1',
            [id]
        );

        return result.rowCount > 0;
    }

    // Job Run Management
    async createJobRun(request: CreateJobRunRequest): Promise<JobRun> {
        const id = uuidv4();
        const now = new Date();

        // Get tenant_id from job definition
        const jobDef = await this.getJobDefinition(request.job_definition_id);
        if (!jobDef) {
            throw new Error(`Job definition not found: ${request.job_definition_id}`);
        }

        const result = await this.dbClient.query(
            `INSERT INTO job_runs (id, job_definition_id, tenant_id, trigger_type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [id, request.job_definition_id, jobDef.tenant_id, request.trigger_type, 'pending', now]
        );

        return this.mapRowToJobRun(result.rows[0]);
    }

    async getJobRun(id: string): Promise<JobRun | null> {
        const result = await this.dbClient.query(
            'SELECT * FROM job_runs WHERE id = $1',
            [id]
        );

        return result.rows.length > 0 ? this.mapRowToJobRun(result.rows[0]) : null;
    }

    async getJobRunsByTenant(tenantId: string, limit: number = 50): Promise<JobRun[]> {
        const result = await this.dbClient.query(
            'SELECT * FROM job_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
            [tenantId, limit]
        );

        return result.rows.map((row: { [key: string]: any }) => this.mapRowToJobRun(row));
    }

    async getJobRunsByDefinition(jobDefinitionId: string, limit: number = 50): Promise<JobRun[]> {
        const result = await this.dbClient.query(
            'SELECT * FROM job_runs WHERE job_definition_id = $1 ORDER BY created_at DESC LIMIT $2',
            [jobDefinitionId, limit]
        );

        return result.rows.map((row: { [key: string]: any }) => this.mapRowToJobRun(row));
    }

    async updateJobRunStatus(id: string, status: JobRun['status'], s3Url?: string, errorMessage?: string): Promise<JobRun | null> {
        const now = new Date();
        const values: any[] = [status];
        let paramIndex = 2;
        let setClauses = ['status = $1'];

        if (status === 'processing' && !await this.getJobRunStartTime(id)) {
            setClauses.push(`started_at = $${paramIndex++}`);
            values.push(now);
        }

        if (status === 'completed' || status === 'failed') {
            setClauses.push(`completed_at = $${paramIndex++}`);
            values.push(now);
        }

        if (s3Url !== undefined) {
            setClauses.push(`s3_url = $${paramIndex++}`);
            values.push(s3Url);
        }

        if (errorMessage !== undefined) {
            setClauses.push(`error_message = $${paramIndex++}`);
            values.push(errorMessage);
        }

        values.push(id);

        const result = await this.dbClient.query(
            `UPDATE job_runs SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        return result.rows.length > 0 ? this.mapRowToJobRun(result.rows[0]) : null;
    }

    private async getJobRunStartTime(id: string): Promise<Date | null> {
        const result = await this.dbClient.query(
            'SELECT started_at FROM job_runs WHERE id = $1',
            [id]
        );
        return result.rows.length > 0 ? result.rows[0].started_at : null;
    }

    private mapRowToJobDefinition(row: { [key: string]: any }): JobDefinition {
        return {
            id: row.id,
            tenant_id: row.tenant_id,
            name: row.name,
            job_spec: typeof row.job_spec === 'string' ? JSON.parse(row.job_spec) : row.job_spec,
            schedule: row.schedule,
            enabled: row.enabled,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    private mapRowToJobRun(row: { [key: string]: any }): JobRun {
        return {
            id: row.id,
            job_definition_id: row.job_definition_id,
            tenant_id: row.tenant_id,
            trigger_type: row.trigger_type,
            status: row.status,
            s3_url: row.s3_url,
            error_message: row.error_message,
            started_at: row.started_at ? new Date(row.started_at) : undefined,
            completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
            created_at: new Date(row.created_at)
        };
    }
}
