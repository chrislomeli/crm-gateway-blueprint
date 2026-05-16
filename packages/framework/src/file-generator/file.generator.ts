import { FileS3Writer } from './file.s3-writer';
import { JobRepository } from './job.repository'
import { JobDefinition, JobRun, JobSpec, FileGenerationResult } from './types';

export class FileGenerator {
  constructor(
    private s3Client: FileS3Writer,
    private jobManager: JobRepository
  ) {}

  async initialize(): Promise<void> {
    console.log('Initializing FileGenerator...');
    await this.jobManager.initializeTables();
    console.log('FileGenerator initialized successfully');
  }

  /**
   * Process a job run by generating the file based on the job definition
   */
  async processJobRun(jobRunId: string): Promise<FileGenerationResult> {
    console.log(`Processing job run: ${jobRunId}`);

    try {
      // Get the job run
      const jobRun = await this.jobManager.getJobRun(jobRunId);
      if (!jobRun) {
        throw new Error(`Job run not found: ${jobRunId}`);
      }

      // Get the job definition
      const jobDefinition = await this.jobManager.getJobDefinition(jobRun.job_definition_id);
      if (!jobDefinition) {
        throw new Error(`Job definition not found: ${jobRun.job_definition_id}`);
      }

      // Update status to processing
      await this.jobManager.updateJobRunStatus(jobRunId, 'processing');

      // Generate the file based on job definition
      const result = await this.generateFile(jobDefinition, jobRun);

      // Update job run with results
      await this.jobManager.updateJobRunStatus(
        jobRunId, 
        'completed', 
        result.s3_url
      );

      console.log(`Job run ${jobRunId} completed successfully`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Job run ${jobRunId} failed:`, errorMessage);

      // Update job run with error
      await this.jobManager.updateJobRunStatus(
        jobRunId, 
        'failed', 
        undefined, 
        errorMessage
      );

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Process a job from SQS queue message
   */
  async processQueueJob(message: { job_definition_id: string; tenant_id: string }): Promise<FileGenerationResult> {
    console.log(`Processing queue job for definition: ${message.job_definition_id}`);

    try {
      // Create a new job run for this scheduled execution
      const jobRun = await this.jobManager.createJobRun({
        job_definition_id: message.job_definition_id,
        trigger_type: 'scheduled'
      });

      // Process the job run
      return await this.processJobRun(jobRun.id);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Queue job processing failed:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Generate file based on job definition and run context
   */
  private async generateFile(jobDefinition: JobDefinition, jobRun: JobRun): Promise<FileGenerationResult> {
    const { job_spec } = jobDefinition;
    
    console.log(`Generating ${job_spec.fileType} file with ${job_spec.recordCount} records for tenant ${jobDefinition.tenant_id}`);

    // Generate file content based on type
    const content = await this.generateFileContent(job_spec);
    
    // Create S3 key with tenant and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const s3Key = `tenants/${jobDefinition.tenant_id}/jobs/${jobDefinition.name}/${timestamp}.${job_spec.fileType}`;
    
    // Upload to S3
    const s3Url = await this.s3Client.uploadFile(s3Key, content, this.getContentType(job_spec.fileType));
    
    console.log(`File uploaded to S3: ${s3Url}`);
    
    return {
      success: true,
      s3_url: s3Url,
      recordCount: job_spec.recordCount
    };
  }

  /**
   * Generate file content based on job specification
   */
  private async generateFileContent(jobSpec: JobSpec): Promise<string> {
    const { fileType, recordCount, parameters } = jobSpec;

    switch (fileType) {
      case 'csv':
        return this.generateCSV(recordCount, parameters);
      
      case 'json':
        return this.generateJSON(recordCount, parameters);
      
      case 'xml':
        return this.generateXML(recordCount, parameters);
      
      case 'pdf':
        return this.generatePDF(recordCount, parameters);
      
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  private generateCSV(recordCount: number, parameters?: Record<string, any>): string {
    const headers = parameters?.headers || ['id', 'name', 'email', 'created_at'];
    const lines = [headers.join(',')];
    
    for (let i = 1; i <= recordCount; i++) {
      const record = [
        i,
        `User ${i}`,
        `user${i}@example.com`,
        new Date().toISOString()
      ];
      lines.push(record.join(','));
    }
    
    return lines.join('\n');
  }

  private generateJSON(recordCount: number, parameters?: Record<string, any>): string {
    const records = [];
    
    for (let i = 1; i <= recordCount; i++) {
      records.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        created_at: new Date().toISOString(),
        ...parameters?.additionalFields
      });
    }
    
    return JSON.stringify({ records, total: recordCount }, null, 2);
  }

  private generateXML(recordCount: number, parameters?: Record<string, any>): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n';
    
    for (let i = 1; i <= recordCount; i++) {
      xml += `  <record>\n`;
      xml += `    <id>${i}</id>\n`;
      xml += `    <name>User ${i}</name>\n`;
      xml += `    <email>user${i}@example.com</email>\n`;
      xml += `    <created_at>${new Date().toISOString()}</created_at>\n`;
      xml += `  </record>\n`;
    }
    
    xml += '</records>';
    return xml;
  }

  private generatePDF(recordCount: number, parameters?: Record<string, any>): string {
    // For demo purposes, return a simple text representation
    // In production, you'd use a PDF library like puppeteer or pdfkit
    let content = `PDF Report\n`;
    content += `Generated: ${new Date().toISOString()}\n`;
    content += `Record Count: ${recordCount}\n\n`;
    
    for (let i = 1; i <= recordCount; i++) {
      content += `${i}. User ${i} - user${i}@example.com\n`;
    }
    
    return content;
  }

  private getContentType(fileType: string): string {
    const contentTypes = {
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'pdf': 'application/pdf'
    };
    
    return contentTypes[fileType as keyof typeof contentTypes] || 'text/plain';
  }
}
