import { S3Client as AWSS3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigProvider, CONFIG } from '@platform/configuration';
import {logger} from "@platform/core";


export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class FileS3Writer {
  private s3Client: AWSS3Client;
  private bucket: string;

  constructor(private config: S3Config) {
    this.bucket = config.bucket;
    
    this.s3Client = new AWSS3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      } : undefined,
      forcePathStyle: !!config.endpoint, // Required for LocalStack
    });
  }

  static async fromConfig(configProvider: ConfigProvider): Promise<FileS3Writer> {
    const s3Config = await ConfigProvider.get(CONFIG.BATCH_S3_BUCKETS) as S3Config;
    return new FileS3Writer(s3Config);
  }

  async uploadFile(
    key: string, 
    content: string | Buffer, 
    contentType: string = 'application/octet-stream',
    metadata?: Record<string, string>
  ): Promise<string> {
    logger.debug(`Uploading file to S3: ${this.bucket}/${key}`);
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      Metadata: metadata ? Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [k, String(v)])
      ) : undefined,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      logger.error({error}, `Failed to upload file ${key}:`);
      throw new Error(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

    }

    const fileSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);

    const s3Url = this.getPublicUrl(key);
    logger.debug(`File uploaded successfully: ${s3Url}`);

    return s3Url;
  }

  async downloadFile(key: string): Promise<Buffer> {
    logger.debug(`Downloading file from S3: ${this.bucket}/${key}`);
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    
    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  getPublicUrl(key: string): string {
    if (this.config.endpoint) {
      // LocalStack URL format
      return `${this.config.endpoint}/${this.bucket}/${key}`;
    }
    // AWS S3 URL format
    return `https://${this.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }
}
