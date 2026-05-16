/**
 * Configuration Health Check - validates all config keys return non-empty values
 * Useful for R&D and debugging to ensure all configuration is properly set up
 */

import { CONFIG, ConfigKey } from './config-keys.js';
import {ConfigProvider} from "./config-provider";


export interface ConfigHealthResult {
  key: string;
  path: string;
  status: 'success' | 'error' | 'empty';
  value?: any;
  error?: string;
}

export interface ConfigHealthSummary {
  total: number;
  success: number;
  errors: number;
  empty: number;
  results: ConfigHealthResult[];
}

/**
 * Health check function that validates all configuration keys
 * @param skipKeys - Optional array of config keys to skip (e.g., sensitive ones)
 * @param showValues - Whether to include actual values in results (default: false for security)
 */
export async function checkAllConfigKeys(
  skipKeys: ConfigKey[] = [],
  showValues: boolean = false
): Promise<ConfigHealthSummary> {
  const results: ConfigHealthResult[] = [];
  const skipSet = new Set(skipKeys);

  // Get all config keys except special ones
  const configKeys = Object.keys(CONFIG).filter(key => 
    key !== 'ALL_CONFIG' && !skipSet.has(key as ConfigKey)
  ) as ConfigKey[];

  for (const key of configKeys) {
    const path = CONFIG[key];
    const result: ConfigHealthResult = {
      key,
      path,
      status: 'error'
    };

    try {
      const value = await ConfigProvider.get(path);
      
      if (value === null || value === undefined) {
        result.status = 'empty';
        result.error = 'Value is null or undefined';
      } else if (typeof value === 'string' && value.trim() === '') {
        result.status = 'empty';
        result.error = 'Value is empty string';
      } else if (typeof value === 'object' && Object.keys(value).length === 0) {
        result.status = 'empty';
        result.error = 'Value is empty object';
      } else {
        result.status = 'success';
        if (showValues) {
          result.value = value;
        } else {
          // Show type and length info without exposing sensitive data
          if (typeof value === 'string') {
            result.value = `[string, length: ${value.length}]`;
          } else if (typeof value === 'object') {
            result.value = `[object, keys: ${Object.keys(value).length}]`;
          } else {
            result.value = `[${typeof value}]`;
          }
        }
      }
    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : String(error);
    }

    results.push(result);
  }

  // Calculate summary
  const summary: ConfigHealthSummary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    errors: results.filter(r => r.status === 'error').length,
    empty: results.filter(r => r.status === 'empty').length,
    results
  };

  return summary;
}

/**
 * Pretty print the health check results to console
 */
export function printConfigHealthResults(summary: ConfigHealthSummary): void {
  console.log('\n🔍 Configuration Health Check Results');
  console.log('=====================================');
  console.log(`📊 Total Keys: ${summary.total}`);
  console.log(`✅ Success: ${summary.success}`);
  console.log(`❌ Errors: ${summary.errors}`);
  console.log(`⚠️  Empty: ${summary.empty}`);
  
  if (summary.errors > 0 || summary.empty > 0) {
    console.log('\n🚨 Issues Found:');
    console.log('================');
    
    summary.results
      .filter(r => r.status !== 'success')
      .forEach(result => {
        const icon = result.status === 'error' ? '❌' : '⚠️';
        console.log(`${icon} ${result.key} (${result.path})`);
        console.log(`   ${result.error}`);
      });
  }

  if (summary.success > 0) {
    console.log('\n✅ Successful Keys:');
    console.log('==================');
    
    summary.results
      .filter(r => r.status === 'success')
      .forEach(result => {
        console.log(`✅ ${result.key} (${result.path}) = ${result.value}`);
      });
  }
}

/**
 * Quick health check function that skips sensitive keys by default
 */
export async function quickConfigHealthCheck(): Promise<ConfigHealthSummary> {
  // Skip potentially sensitive keys by default
  const sensitiveKeys: ConfigKey[] = [
    'CALLS_DB_PASSWORD',
    'CRM_DB_PASSWORD',
    'HUBSPOT_CLIENT_SECRET',
    'LOCALSTACK_SECRET_KEY',
    'OPENSEARCH_SECRET_KEY'
  ];

  return checkAllConfigKeys(sensitiveKeys, false);
}

/**
 * Standalone script function for command-line usage
 */
export async function runConfigHealthCheck(): Promise<void> {
  try {
    console.log('🚀 Starting Configuration Health Check...');
    
    // Initialize ConfigProvider if needed
    if (!ConfigProvider.isInitialized()) {
      console.log('📋 Initializing ConfigProvider...');
      await ConfigProvider.initialize();
    }

    const summary = await quickConfigHealthCheck();
    printConfigHealthResults(summary);

    // Exit with error code if there are issues
    if (summary.errors > 0 || summary.empty > 0) {
      console.log('\n💥 Configuration health check failed!');
      process.exit(1);
    } else {
      console.log('\n🎉 All configuration keys are healthy!');
      process.exit(0);
    }
  } catch (error) {
    console.error('💥 Failed to run config health check:', error);
    process.exit(1);
  }
}

// If this file is run directly, execute the health check
if (import.meta.url === `file://${process.argv[1]}`) {
  runConfigHealthCheck().finally();
}
