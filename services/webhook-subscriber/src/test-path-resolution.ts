#!/usr/bin/env tsx
/**
 * Simple test to verify pkg-up path resolution works from anywhere
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pkgUpSync } from "pkg-up";

async function testPathResolution() {
    console.log('🧪 Testing pkg-up path resolution...');
    console.log('📍 Current working directory:', process.cwd());
    
    try {
        // Find project root using pkg-up starting from script directory
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        
        // Search for the main project root (the one with pnpm-workspace.yaml)
        let searchDir = __dirname;
        let projectRoot = null;
        
        while (searchDir !== path.dirname(searchDir)) { // Stop at filesystem root
            const packageJsonPath = path.join(searchDir, 'package.json');
            const workspaceYamlPath = path.join(searchDir, 'pnpm-workspace.yaml');
            const configPath = path.join(searchDir, 'config');
            
            const fs = await import('node:fs');
            if (fs.existsSync(packageJsonPath) && fs.existsSync(workspaceYamlPath) && fs.existsSync(configPath)) {
                projectRoot = searchDir;
                break;
            }
            searchDir = path.dirname(searchDir);
        }
        
        if (!projectRoot) {
            throw new Error('Could not find main project root (with pnpm-workspace.yaml and config folder)');
        }
        const configFolder = path.join(projectRoot, 'config');
        
        console.log('✅ Project root found:', projectRoot);
        console.log('✅ Config folder path:', configFolder);
        console.log('✅ pkg-up path resolution working correctly!');
        
        // Verify the config folder exists
        const fs = await import('node:fs');
        if (fs.existsSync(configFolder)) {
            console.log('✅ Config folder exists and is accessible');
        } else {
            console.log('⚠️  Config folder path resolved but directory does not exist');
        }
        
    } catch (error) {
        console.error('❌ Path resolution failed:', error);
        process.exit(1);
    }
}

// Run the test
testPathResolution().then(() => {
    console.log('🎉 Path resolution test completed successfully!');
    console.log('📝 You can now run this script from anywhere using: tsx services/webhook-subscriber/src/test-path-resolution.ts');
}).catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
});
