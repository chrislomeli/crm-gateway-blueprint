#!/usr/bin/env ts-node
/**
 * Integration Test Runner
 * 
 * This script orchestrates the complete integration test process:
 * 1. Ensures LocalStack is running
 * 2. Sets up test secrets in LocalStack
 * 3. Runs the integration test suite
 * 4. Cleans up test data
 */

import { execSync } from 'child_process';
import { setupLocalStackSecrets, verifyLocalStackSecrets, cleanupLocalStackSecrets } from './setup-localstack-secrets';

async function checkLocalStackHealth(): Promise<boolean> {
  try {
    console.log('🔍 Checking LocalStack health...');
    
    // Check if LocalStack is responding (using NodePort 30568)
    const response = await fetch('http://localhost:30568/_localstack/health');
    const health = await response.json();
    
    console.log('📊 LocalStack services status:', health.services);
    
    // Check if Secrets Manager is available or running
    if (health.services.secretsmanager !== 'available' && health.services.secretsmanager !== 'running') {
      console.error('❌ LocalStack Secrets Manager is not available');
      return false;
    }
    
    console.log('✅ LocalStack is healthy and ready');
    return true;
  } catch (error) {
    console.error('❌ LocalStack health check failed:', error);
    console.log('💡 Make sure LocalStack is running: kubectl port-forward svc/localstack 4566:4566');
    return false;
  }
}

async function runIntegrationTests(): Promise<void> {
  console.log('🚀 Starting Secrets Management Integration Tests');
  console.log('================================================');
  
  try {
    // Step 1: Check LocalStack health
    const isHealthy = await checkLocalStackHealth();
    if (!isHealthy) {
      process.exit(1);
    }
    
    // Step 2: Setup test secrets
    console.log('\n📝 Setting up test secrets in LocalStack...');
    await setupLocalStackSecrets();
    await verifyLocalStackSecrets();
    
    // Step 3: Run the integration tests
    console.log('\n🧪 Running integration test suite...');
    try {
      execSync('npx vitest run src/test/secrets-integration.test.ts', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ All integration tests passed!');
    } catch (error) {
      console.error('❌ Integration tests failed');
      throw error;
    }
    
    // Step 4: Cleanup (optional - comment out if you want to inspect secrets)
    console.log('\n🧹 Cleaning up test secrets...');
    await cleanupLocalStackSecrets();
    
    console.log('\n🎉 Integration test run completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Integration test run failed:', error);
    
    // Attempt cleanup even on failure
    try {
      console.log('\n🧹 Attempting cleanup after failure...');
      await cleanupLocalStackSecrets();
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup after failure also failed:', cleanupError);
    }
    
    process.exit(1);
  }
}

// CLI usage (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'health':
      checkLocalStackHealth().then(healthy => {
        process.exit(healthy ? 0 : 1);
      });
      break;
    case 'setup':
      setupLocalStackSecrets().catch(error => {
        console.error(error);
        process.exit(1);
      });
      break;
    case 'cleanup':
      cleanupLocalStackSecrets().catch(error => {
        console.error(error);
        process.exit(1);
      });
      break;
    case 'run':
    case undefined:
      runIntegrationTests();
      break;
    default:
      console.log('Usage: tsx run-integration-tests.ts [health|setup|cleanup|run]');
      console.log('');
      console.log('Commands:');
      console.log('  health  - Check LocalStack connectivity');
      console.log('  setup   - Setup test secrets only');
      console.log('  cleanup - Cleanup test secrets only');
      console.log('  run     - Full integration test run (default)');
      process.exit(1);
  }
}
