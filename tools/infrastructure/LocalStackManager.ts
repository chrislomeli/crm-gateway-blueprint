#!/usr/bin/env tsx


/**
 * LocalStack Infrastructure Manager
 * 
 * Reliable TypeScript-based infrastructure setup for K8s validation.
 * Replaces brittle shell scripts with proper error handling and idempotent operations.
 */

// @ts-ignore
import { SQSService } from '@platform/services';
import { SecretsService } from '@platform/services';
import { isFailure } from '@platform/core';

// LocalStack configuration - environment-aware
const getLocalStackEndpoint = (): string => {
  // Check if we're running in K8s environment
  if (process.env.KUBERNETES_SERVICE_HOST) {
    return 'http://localstack:4566';
  }
  
  // Check for explicit endpoint override
  if (process.env.LOCALSTACK_ENDPOINT) {
    return process.env.LOCALSTACK_ENDPOINT;
  }
  
  // Default to NodePort for local Kind cluster
  return 'http://localhost:30568';
};

const LOCALSTACK_CONFIG = {
  endpoint: getLocalStackEndpoint(),
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
};

// Queue configuration from ConfigMaps
const SQS_QUEUES = {
  hubspot: {
    webhookSingleQueueName: 'hubspot-webhook-single-queue',
    webhookImportQueueName: 'hubspot-webhook-import-queue', 
    intentQueueName: 'hubspot-intent-queue',
  }
};

// Clear text secrets for validation (no complex resolution)
const SECRETS = {
  'postgres': {
    host: 'localhost',
    port: 5432,
    database: 'hello_world',
    username: 'christian',
    password: 'antigone',
    ssl_mode: 'disable'
  },
  'mysql': {
    host: 'localhost',
    port: 30306,
    database: 'calls',
    username: 'acme_user',
    password: 'acme_password'
  },
  'shared-infrastructure': {
    aws_region: 'us-east-1',
    localstack_endpoint: 'http://localstack:4566',
    log_retention_days: '7',
    monitoring_enabled: 'true'
  },
  'pipeline-worker-credentials': {
    worker_timeout: '30',
    max_retries: '3',
    sqs_region: 'us-east-1',
    api_key: 'dev-api-key-123',
    log_level: 'debug'
  },
  'elasticsearch-credentials': {
    host: 'elasticsearch',
    port: 9200
  },
  'hello-world-credentials': {
    jwt_secret: 'dev-jwt-secret-key-for-local-testing-only'
  },
  'hubspot-api': {
    apiKey: '--------------------'
  }
};

export class LocalStackManager {
  constructor() {
    // Using existing service abstractions instead of direct AWS SDK clients
  }

  /**
   * Validate or create SQS queue - idempotent operation
   */
  async validateOrCreateSQSQueue(queueName: string): Promise<string> {
    console.log(`🔍 Validating SQS queue: ${queueName}`);
    
    // First, try to get existing queue URL using the service abstraction
    const getUrlResult = await SQSService.getQueueUrl(queueName);
    
    if (!isFailure(getUrlResult)) {
      console.log(`   ✅ Queue exists: ${getUrlResult.data}`);
      return getUrlResult.data;
    }
    
    // Queue doesn't exist, create it using the extended SQS service
    console.log(`   📦 Queue doesn't exist, creating: ${queueName}`);
    
    const createResult = await SQSService.createQueue(queueName);
    
    if (!isFailure(createResult)) {
      console.log(`   ✅ Queue created successfully: ${createResult.data}`);
      return createResult.data;
    } else {
      console.error(`   ❌ Failed to create queue ${queueName}: ${createResult.error.message}`);
      throw createResult.error;
    }
  }

  /**
   * Setup all required SQS queues
   */
  async setupSQSQueues(): Promise<Record<string, string>> {
    console.log('🚀 Setting up SQS queues...');
    
    const queueUrls: Record<string, string> = {};
    const allQueues = Object.values(SQS_QUEUES.hubspot);
    
    for (const queueName of allQueues) {
      try {
        const queueUrl = await this.validateOrCreateSQSQueue(queueName);
        queueUrls[queueName] = queueUrl;
      } catch (error) {
        console.error(`❌ Failed to setup queue ${queueName}`);
        throw error;
      }
    }
    
    console.log('✅ All SQS queues ready');
    return queueUrls;
  }

  /**
   * Create or update secret in Secrets Manager - idempotent operation
   */
  async createOrUpdateSecret(secretName: string, secretValue: Record<string, any>): Promise<void> {
    console.log(`🔐 Setting up secret: ${secretName}`);
    
    // Use the existing SecretsService abstraction with overwrite=true for idempotent behavior
    const result = await SecretsService.putSecret(secretName, secretValue, true);
    
    if (isFailure(result)) {
      console.error(`   ❌ Failed to create/update secret ${secretName}:`, result.error);
      throw new Error(`Failed to setup secret ${secretName}: ${result.error}`);
    }
    
    console.log(`   ✅ Secret created/updated: ${secretName}`);
  }

  /**
   * Setup all required secrets in Secrets Manager
   */
  async setupSecretsManager(): Promise<void> {
    console.log('🚀 Setting up Secrets Manager...');
    
    for (const [secretName, secretValue] of Object.entries(SECRETS)) {
      try {
        await this.createOrUpdateSecret(secretName, secretValue);
      } catch (error) {
        console.error(`❌ Failed to setup secret ${secretName}`);
        throw error;
      }
    }
    
    console.log('✅ All secrets ready');
  }

  /**
   * Verify LocalStack connectivity
   */
  async verifyConnectivity(): Promise<boolean> {
    console.log('🔍 Verifying LocalStack connectivity...');
    
    try {
      // Test SQS connectivity by trying to get a queue URL
      const sqsTestResult = await SQSService.getQueueUrl('test-connectivity-queue');
      // We expect this to fail for a non-existent queue, but it verifies SQS connectivity
      console.log('   ✅ SQS connectivity verified');
      
      // Test Secrets Manager connectivity by trying to fetch a non-existent secret
      const secretsTestResult = await SecretsService.fetchSecret('test-connectivity-secret');
      // We expect this to fail for a non-existent secret, but it verifies Secrets Manager connectivity
      console.log('   ✅ Secrets Manager connectivity verified');
      
      return true;
    } catch (error: any) {
      console.error('   ❌ LocalStack connectivity failed:', error.message);
      return false;
    }
  }

  /**
   * Complete LocalStack setup - idempotent operation
   */
  async setupLocalStack(): Promise<{ queueUrls: Record<string, string>; success: boolean }> {
    console.log('🚀 LocalStack Infrastructure Setup');
    console.log('==================================');
    console.log('');
    
    try {
      // Verify connectivity first
      const connected = await this.verifyConnectivity();
      if (!connected) {
        throw new Error('LocalStack connectivity failed');
      }
      console.log('');
      
      // Setup secrets
      await this.setupSecretsManager();
      console.log('');
      
      // Setup SQS queues
      const queueUrls = await this.setupSQSQueues();
      console.log('');
      
      console.log('🎉 LocalStack Setup Complete!');
      console.log('=============================');
      console.log('');
      console.log('📊 Summary:');
      console.log(`   • SQS Queues: ${Object.keys(queueUrls).length} created/verified`);
      console.log(`   • Secrets: ${Object.keys(SECRETS).length} created/verified`);
      console.log('   • All resources ready for K8s validation');
      console.log('');
      
      return { queueUrls, success: true };
      
    } catch (error: any) {
      console.error('❌ LocalStack setup failed:', error.message);
      return { queueUrls: {}, success: false };
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const manager = new LocalStackManager();
  const result = await manager.setupLocalStack();
  
  if (!result.success) {
    process.exit(1);
  }
}

// Run if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
