#!/usr/bin/env tsx

/**
 * Load Full UserCRM Dataset Script
 * 
 * This script loads the complete userCRM dataset from the SQL file
 * into the MySQL database. Use this after running the main init script
 * if you need the full dataset for testing.
 */

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local development database configuration
const MYSQL_CONFIG = {
  host: 'localhost',
  port: 30306, // NodePort for MySQL
  user: 'acme_user',
  password: 'acme_password',
  database: 'calls',
  connectTimeout: 30000,
};

async function loadFullUserCRM(): Promise<void> {
  console.log('🔄 Loading full userCRM dataset...');
  
  let connection: mysql.Connection | null = null;
  
  try {
    // Read the SQL file
    const sqlFilePath = join(__dirname, '..', 'services', 'webhook-subscriber', 'src', 'intents', 'qa-tools', 'userCRM.sql');
    console.log('   📂 Reading SQL file:', sqlFilePath);
    
    const sqlContent = readFileSync(sqlFilePath, 'utf8');
    
    // Parse the SQL content to extract values
    const lines = sqlContent.split('\n');
    const valueLines = lines.slice(1).filter(line => line.trim() && !line.trim().startsWith('--'));
    
    console.log(`   📊 Found ${valueLines.length} data lines to process`);
    
    // Connect to database
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('   ✅ Connected to MySQL');
    
    // Clear existing userCRM data
    console.log('   🧹 Clearing existing userCRM data...');
    await connection.execute('DELETE FROM userCRM');
    
    // Prepare insert query
    const insertQuery = `
      INSERT IGNORE INTO userCRM (businessid, userid, accountid) 
      VALUES (?, ?, ?)
    `;
    
    let insertedCount = 0;
    let errorCount = 0;
    
    console.log('   📥 Inserting userCRM data...');
    
    for (const line of valueLines) {
      try {
        // Parse each line: (995, 10706, '6283166'),
        const match = line.match(/\((\d+),\s*(\d+),\s*'([^']+)'\)/);
        if (match) {
          const [, businessid, userid, accountid] = match;
          await connection.execute(insertQuery, [
            parseInt(businessid),
            parseInt(userid),
            accountid
          ]);
          insertedCount++;
          
          if (insertedCount % 100 === 0) {
            process.stdout.write(`\r   📥 Inserted ${insertedCount} records...`);
          }
        }
      } catch (error) {
        errorCount++;
        if (errorCount < 10) {
          console.warn(`\n   ⚠️  Error processing line: ${line.trim()}`);
        }
      }
    }
    
    console.log(`\n   ✅ Inserted ${insertedCount} userCRM records`);
    if (errorCount > 0) {
      console.log(`   ⚠️  Skipped ${errorCount} invalid lines`);
    }
    
    // Verify the data
    const [results] = await connection.execute(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT businessid) as unique_businesses,
        COUNT(DISTINCT userid) as unique_users,
        COUNT(DISTINCT accountid) as unique_accounts
      FROM userCRM
    `) as any;
    
    console.log('   📊 Final UserCRM Data Summary:');
    console.log(`      Total records: ${results[0].total_records}`);
    console.log(`      Unique businesses: ${results[0].unique_businesses}`);
    console.log(`      Unique users: ${results[0].unique_users}`);
    console.log(`      Unique accounts: ${results[0].unique_accounts}`);
    
    console.log('   ✅ Full userCRM dataset loaded successfully');
    
  } catch (error) {
    console.error('   ❌ Failed to load full userCRM dataset:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function main(): Promise<void> {
  console.log('🚀 Load Full UserCRM Dataset');
  console.log('============================');
  console.log('');
  
  try {
    await loadFullUserCRM();
    console.log('');
    
    console.log('🎉 Full UserCRM Dataset Loaded!');
    console.log('===============================');
    console.log('');
    console.log('📈 Summary:');
    console.log('   • Complete userCRM dataset loaded from SQL file');
    console.log('   • All business-user-account relationships available');
    console.log('   • Ready for comprehensive webhook subscriber testing');
    console.log('');
    console.log('💡 Usage:');
    console.log('   • Run script: tsx scripts/load-full-usercrm.ts');
    console.log('   • Or via pnpm: pnpm exec tsx scripts/load-full-usercrm.ts');
    console.log('');
    console.log('🔧 Database Access:');
    console.log(`   • MySQL: localhost:${MYSQL_CONFIG.port} (user: ${MYSQL_CONFIG.user})`);
    console.log(`   • Database: ${MYSQL_CONFIG.database}`);
    console.log('   • Connect: mysql -h localhost -P 30306 -u acme_user -pacme_password calls');
    
  } catch (error) {
    console.error('❌ Failed to load full userCRM dataset:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
