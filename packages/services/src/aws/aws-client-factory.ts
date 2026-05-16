import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, SecretsManagerClientConfig } from '@aws-sdk/client-secrets-manager';
import { SSMClient, SSMClientConfig } from '@aws-sdk/client-ssm';
import { logger } from '@platform/core';

/**
 * Factory for creating AWS service clients with consistent configuration
 * Handles both production (IAM roles) and local/test (localstack) environments
 */
export class AwsClientFactory {
  /**
   * Default request handler options to improve reliability in Docker environments
   */
  private static defaultRequestHandlerOptions = {
    connectionTimeout: 30000, // 30 seconds - increased for server mode
    socketTimeout: 60000      // 60 seconds - increased for long polling
  };


  /**
   * Get the AWS client configuration based on the current environment
   * Uses environment variables to detect local/test vs production
   * 
   * @returns The client config for the current environment
   */
  static getClientConfig<T extends object>(): T {
    // Check if we're in local/test environment (only these use localstack)
    const isLocalStack = process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'test';
    const region = process.env.AWS_REGION || 'us-west-2';
    
    logger.info({
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
      isLocalStack,
      region
    }, '🌍 AwsClientFactory: Environment detection and configuration');
    
    // For local/test environment, use localstack configuration
    if (isLocalStack) {
      const finalEndpoint = process.env.AWS_ENDPOINT_URL;
      
      const config = {
        region,
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test'
        },
        endpoint: finalEndpoint,
        requestHandler: this.defaultRequestHandlerOptions
      };

      logger.info({ 
        isLocalStack,
        finalEndpoint: config.endpoint,
        region: config.region,
        credentials: config.credentials
      }, '🏗️ Using LocalStack AWS configuration');

      return config as unknown as T;
    }
    
    // For production, use AWS SDK default credential chain
    // This allows IRSA, instance profiles, and other EKS-native credential mechanisms
    logger.info({ region }, 'Using production AWS configuration with default credential chain');
    return {
      region,
      requestHandler: this.defaultRequestHandlerOptions
    } as unknown as T;
  }

  /**
   * Create an S3 client with the appropriate configuration
   */
  static createS3Client(): S3Client {
    const config = this.getClientConfig<S3ClientConfig>();
    return new S3Client(config);
  }

  /**
   * Create an SQS client with the appropriate configuration
   */
  static createSQSClient(): SQSClient {
    const config = this.getClientConfig<SQSClientConfig>();
    
    // For LocalStack, ensure we use the configured endpoint instead of queue URL hostname
    const isLocalStack = process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'test';
    if (isLocalStack) {
      (config as any).useQueueUrlAsEndpoint = false;
    }
    
    return new SQSClient(config);
  }

  /**
   * Create a Secrets Manager client with the appropriate configuration
   */
  static createSecretsManagerClient(): SecretsManagerClient {
    const config = this.getClientConfig<SecretsManagerClientConfig>();
    return new SecretsManagerClient(config);
  }

  /**
   * Create an SSM (Parameter Store) client with the appropriate configuration
   */
  static createSSMClient(): SSMClient {
    const config = this.getClientConfig<SSMClientConfig>();
    return new SSMClient(config);
  }

}
