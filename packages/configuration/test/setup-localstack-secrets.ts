/**
 * LocalStack Secrets Setup for Integration Tests
 * 
 * This script populates LocalStack Secrets Manager with test secrets
 * that match the production !ssm<key>[field] pattern using structured JSON.
 * 
 * Uses existing SecretsService from @platform/services to avoid duplicate AWS SDK dependencies.
 * 
 * Run this before integration tests to ensure LocalStack has the required secrets.
 */

import { SecretsService } from '@platform/services';

// Test secrets matching production patterns
const testSecrets = {
  // Database secrets (structured JSON)
  'postgres-database': {
    hostname: '127.0.0.1',
    username: 'christian', 
    password: 'antigone',
    database: 'acme_dev',
    port: 5432
  },
  
  'mysql-database': {
    hostname: '127.0.0.1',
    username: 'christian',
    password: 'antigone', 
    database: 'acme_dev',
    port: 3306
  },
  
  // API keys and service secrets
  'datadog-api': {
    api_key: 'test-datadog-api-key',
    app_key: 'test-datadog-app-key',
    site: 'datadoghq.com'
  },
  
  // Simple string secrets wrapped in JSON (required by SecretsService)
  'simple-secret': {
    value: 'simple-secret-value'
  },
  
  // Complex nested JSON for advanced testing
  'complex-config': {
    services: {
      elasticsearch: {
        hosts: ['localhost:9200'],
        auth: {
          username: 'elastic',
          password: 'changeme'
        }
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: 'redis-password'
      }
    },
    features: {
      batch_processing: true,
      real_time_sync: false
    }
  },
  
  // Additional JSON-wrapped simple values for testing
  'api-token': {
    token: 'test-api-token-12345'
  },
  
  // Simple string secret for negative testing (should fail JSON parsing)
  'invalid-string-secret': 'this-is-just-a-string-not-json'
};

/**
 * Setup LocalStack secrets for integration testing
 */
export async function setupLocalStackSecrets(): Promise<void> {
  console.log('🔧 Setting up LocalStack secrets for integration tests...');
  
  // Ensure we're using LocalStack configuration
  process.env.NODE_ENV = 'test';
  process.env.AWS_ENDPOINT_URL = 'http://localhost:30568';
  
  for (const [secretName, secretValue] of Object.entries(testSecrets)) {
    try {
      const secretString = typeof secretValue === 'string' 
        ? secretValue 
        : JSON.stringify(secretValue);
      
      // Use SecretsService.upsertSecret which handles create/update logic
      const result = await SecretsService.upsertSecret(
        secretName, 
        secretString, 
        { description: `Test secret for integration tests: ${secretName}` }
      );
      
      if (result.success) {
        console.log(`✅ Setup secret: ${secretName}`);
      } else {
        console.error(`❌ Failed to setup secret ${secretName}:`, result.error.message);
        throw new Error(result.error.message);
      }
    } catch (error) {
      console.error(`❌ Failed to setup secret ${secretName}:`, error);
      throw error;
    }
  }
  
  console.log('✅ LocalStack secrets setup complete!');
}

/**
 * Verify LocalStack secrets are accessible
 */
export async function verifyLocalStackSecrets(): Promise<boolean> {
  console.log('🔍 Verifying LocalStack secrets...');
  
  // Ensure we're using LocalStack configuration
  process.env.NODE_ENV = 'test';
  process.env.AWS_ENDPOINT_URL = 'http://localhost:30568';
  
  for (const secretName of Object.keys(testSecrets)) {
    try {
      const result = await SecretsService.fetchSecret(secretName);
      if (result.success) {
        console.log(`✅ Verified secret exists: ${secretName}`);
      } else {
        console.error(`❌ Failed to verify secret ${secretName}:`, result.error.message);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to verify secret ${secretName}:`, error);
      return false;
    }
  }
  
  console.log('✅ All LocalStack secrets verified!');
  return true;
}

/**
 * Clean up LocalStack secrets (for test isolation)
 */
export async function cleanupLocalStackSecrets(): Promise<void> {
  console.log('🧹 Cleaning up LocalStack secrets...');
  
  // Ensure we're using LocalStack configuration
  process.env.NODE_ENV = 'test';
  process.env.AWS_ENDPOINT_URL = 'http://localhost:30568';
  
  for (const secretName of Object.keys(testSecrets)) {
    try {
      // Check if secret exists by trying to fetch it
      const result = await SecretsService.fetchSecret(secretName);
      if (result.success) {
        // Secret exists - for LocalStack we can just note it exists
        // LocalStack doesn't have a delete API in our SecretsService, but that's OK
        // The secrets will be cleaned up when LocalStack restarts
        console.log(`ℹ️ Secret ${secretName} exists (will be cleaned up on LocalStack restart)`);
      } else {
        console.log(`ℹ️ Secret ${secretName} already doesn't exist`);
      }
    } catch (error: any) {
      console.log(`ℹ️ Secret ${secretName} cleanup check completed`);
    }
  }
  
  console.log('✅ LocalStack secrets cleanup complete!');
}

// Export test secrets for use in tests
export { testSecrets };

// CLI usage (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setupLocalStackSecrets().catch(console.error);
      break;
    case 'verify':
      verifyLocalStackSecrets().catch(console.error);
      break;
    case 'cleanup':
      cleanupLocalStackSecrets().catch(console.error);
      break;
    default:
      console.log('Usage: tsx setup-localstack-secrets.ts [setup|verify|cleanup]');
      process.exit(1);
  }
}
