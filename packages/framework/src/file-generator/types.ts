export interface JobSpec {
  fileType: 'csv' | 'json' | 'xml' | 'pdf';
  recordCount: number;
  filters?: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface JobDefinition {
  id: string;
  tenant_id: string;
  name: string;
  job_spec: JobSpec;
  schedule: string; // cron expression or 'manual'
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface JobRun {
  id: string;
  job_definition_id: string;
  tenant_id: string;
  trigger_type: 'api' | 'scheduled' | 'manual';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  s3_url?: string;
  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
}

export interface CreateJobDefinitionRequest {
  tenant_id: string;
  name: string;
  job_spec: JobSpec;
  schedule: string;
  enabled?: boolean;
}

export interface CreateJobRunRequest {
  job_definition_id: string;
  trigger_type: 'api' | 'scheduled' | 'manual';
}

export interface FileGenerationResult {
  success: boolean;
  s3_url?: string;
  error?: string;
  recordCount?: number;
}
