#!/usr/bin/env node

/**
 * ConfigProvider Test Runner
 * 
 * Runs comprehensive tests for the refactored ConfigProvider system
 * including integration tests with real file system operations.
 */

import { execSync } from 'child_process';
import * as path from 'path';

const testFiles = [
  'config-provider.test.ts',
  'source-based-secrets-cache.test.ts', 
  'secrets-provider.test.ts'
];

console.log('🧪 Running ConfigProvider Test Suite');
console.log('====================================');

try {
  // Run each test file
  for (const testFile of testFiles) {
    console.log(`\n📋 Running ${testFile}...`);
    
    const testPath = path.join(__dirname, testFile);
    const command = `npx vitest run ${testPath} --reporter=verbose`;
    
    try {
      execSync(command, { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '../../../..')
      });
      console.log(`✅ ${testFile} passed`);
    } catch (error) {
      console.error(`❌ ${testFile} failed`);
      throw error;
    }
  }

  console.log('\n🎉 All ConfigProvider tests passed!');
  console.log('\n📊 Test Coverage:');
  console.log('- ✅ ConfigProvider initialization and API');
  console.log('- ✅ Secret merging and caching');
  console.log('- ✅ K8s secrets loading');
  console.log('- ✅ AWS SSM integration');
  console.log('- ✅ Error handling and edge cases');
  console.log('- ✅ Background refresh and TTL');
  console.log('- ✅ Integration scenarios');

} catch (error) {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
}
