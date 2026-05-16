#!/usr/bin/env tsx

/**
 * Infrastructure Manager
 * 
 * Orchestrates complete infrastructure setup for K8s validation.
 * Replaces scattered shell scripts with reliable TypeScript operations.
 */

import { LocalStackManager } from './LocalStackManager';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ValidationResult {
  localstack: boolean;
  database: boolean;
  queues: Record<string, string>;
  secrets: boolean;
  overall: boolean;
}

export class InfrastructureManager {
  private localStackManager: LocalStackManager;

  constructor() {
    this.localStackManager = new LocalStackManager();
  }

  /**
   * Run the existing database setup script
   */
  async setupDatabase(): Promise<boolean> {
    console.log('🗄️  Setting up MySQL database...');
    
    try {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'setup.database.ts');
      
      // Execute the existing database setup script
      console.log('   📝 Running database initialization script...');
      execSync(`tsx "${scriptPath}"`, { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..', '..')
      });
      
      console.log('   ✅ Database setup completed');
      return true;
      
    } catch (error: any) {
      console.error('   ❌ Database setup failed:', error.message);
      return false;
    }
  }

  /**
   * Verify database connectivity
   */
  async verifyDatabaseConnectivity(): Promise<boolean> {
    console.log('🔍 Verifying database connectivity...');
    
    try {
      // Simple connectivity test using mysql2
      const connection = await mysql.createConnection({
        host: 'localhost',
        port: 30306,
        user: 'acme_user',
        password: 'acme_password',
        database: 'calls',
        connectTimeout: 10000,
      });
      
      await connection.execute('SELECT 1');
      await connection.end();
      
      console.log('   ✅ Database connectivity verified');
      return true;
      
    } catch (error: any) {
      console.error('   ❌ Database connectivity failed:', error.message);
      return false;
    }
  }

  /**
   * Complete infrastructure setup
   */
  async setupInfrastructure(): Promise<ValidationResult> {
    console.log('🚀 Complete Infrastructure Setup');
    console.log('================================');
    console.log('');
    
    const result: ValidationResult = {
      localstack: false,
      database: false,
      queues: {},
      secrets: false,
      overall: false,
    };

    try {
      // 1. Setup LocalStack (SQS + Secrets Manager)
      console.log('📦 STEP 1: LocalStack Setup');
      console.log('---------------------------');
      const localStackResult = await this.localStackManager.setupLocalStack();
      result.localstack = localStackResult.success;
      result.queues = localStackResult.queueUrls;
      result.secrets = localStackResult.success;
      console.log('');

      if (!result.localstack) {
        throw new Error('LocalStack setup failed');
      }

      // 2. Setup MySQL Database
      console.log('📦 STEP 2: Database Setup');
      console.log('-------------------------');
      result.database = await this.setupDatabase();
      console.log('');

      if (!result.database) {
        throw new Error('Database setup failed');
      }

      // 3. Verify connectivity
      console.log('📦 STEP 3: Connectivity Verification');
      console.log('------------------------------------');
      const dbConnected = await this.verifyDatabaseConnectivity();
      const localStackConnected = await this.localStackManager.verifyConnectivity();
      console.log('');

      if (!dbConnected || !localStackConnected) {
        throw new Error('Connectivity verification failed');
      }

      // Success!
      result.overall = true;
      
      console.log('🎉 Infrastructure Setup Complete!');
      console.log('==================================');
      console.log('');
      console.log('📊 Summary:');
      console.log('   ✅ LocalStack: SQS + Secrets Manager ready');
      console.log(`   ✅ SQS Queues: ${Object.keys(result.queues).length} queues created`);
      console.log(`   ✅ Secrets: ${Object.keys(result.queues).length > 0 ? 'All secrets ready' : 'Ready'}`);
      console.log('   ✅ MySQL: Database and tables ready');
      console.log('   ✅ Connectivity: All services verified');
      console.log('');
      console.log('🚀 Ready for K8s validation!');
      console.log('');
      console.log('💡 Next Steps:');
      console.log('   1. Apply K8s deployments with LocalStack credentials');
      console.log('   2. Verify ConfigProvider can load configs and secrets');
      console.log('   3. Test end-to-end service functionality');
      console.log('');

    } catch (error: any) {
      console.error('❌ Infrastructure setup failed:', error.message);
      result.overall = false;
    }

    return result;
  }

  /**
   * Quick health check of all infrastructure
   */
  async healthCheck(): Promise<ValidationResult> {
    console.log('🩺 Infrastructure Health Check');
    console.log('==============================');
    console.log('');

    const result: ValidationResult = {
      localstack: false,
      database: false,
      queues: {},
      secrets: false,
      overall: false,
    };

    try {
      // Check LocalStack
      result.localstack = await this.localStackManager.verifyConnectivity();
      
      // Check Database
      result.database = await this.verifyDatabaseConnectivity();
      
      // Overall health
      result.overall = result.localstack && result.database;
      
      console.log('📊 Health Check Results:');
      console.log(`   LocalStack: ${result.localstack ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`   Database: ${result.database ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`   Overall: ${result.overall ? '✅ Ready' : '❌ Issues detected'}`);
      console.log('');

    } catch (error: any) {
      console.error('❌ Health check failed:', error.message);
    }

    return result;
  }
}

// CLI interface
async function main(): Promise<void> {
  const manager = new InfrastructureManager();
  
  const command = process.argv[2] || 'setup';
  
  switch (command) {
    case 'setup':
      const setupResult = await manager.setupInfrastructure();
      if (!setupResult.overall) {
        process.exit(1);
      }
      break;
      
    case 'health':
      const healthResult = await manager.healthCheck();
      if (!healthResult.overall) {
        process.exit(1);
      }
      break;
      
    default:
      console.log('Usage: tsx InfrastructureManager.ts [setup|health]');
      console.log('  setup  - Complete infrastructure setup (default)');
      console.log('  health - Quick health check');
      process.exit(1);
  }
}

// Run if called directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
