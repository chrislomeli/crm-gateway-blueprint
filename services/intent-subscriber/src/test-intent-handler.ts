#!/usr/bin/env tsx
/**
 * Quick test file for intent-handler
 * Sets environment variables and calls main() function directly
 */

// Set environment variables for local testing
import {ConfigProvider} from "@platform/configuration";
import {getErrorInfo, logger} from "@platform/core";
import {HubspotIntentProcessor} from "@crm/hubspot";
import {getApplicationContext} from "./context-provider";
import {processWebhookMessages} from "./sqs-message-consumer";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = 'development';
process.env.AWS_REGION = 'us-west-2';
// process.env.AWS_ENDPOINT_URL = 'http://localhost:30566'; // LocalStack endpoint

// Import the main function directly
export async function testIntentHandler(options?: any) {
    try {

        await ConfigProvider.initialize(options);

        // Configure logger from config after initialization
        if (ConfigProvider.isInitialized()) {
            const logLevel = ConfigProvider.get('log.level') || 'debug';
            logger.setLogLevel(logLevel);
        }

        logger.info('🧪 Intent Handler Test - Starting...');
        logger.info({
            NODE_ENV: process.env.NODE_ENV,
            AWS_REGION: process.env.AWS_REGION
        }, '📍 Environment:');

        // Now run the intent processing
        // Create a cache instance for the main process
        const context = getApplicationContext();
        const messageProcessor = new HubspotIntentProcessor();
        
        logger.info('🚀 Starting intent message processing...');
        await processWebhookMessages(messageProcessor, context);

    } catch (error) {
        const errorInfo = getErrorInfo(error);
        logger.error({
            error: errorInfo,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, 'Fatal error in main function');
        console.error('Raw error:', error);
        process.exit(1);
    }
}

async function runTest() {
    console.log('🧪 Starting intent-handler test...');
    console.log('📍 Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        AWS_REGION: process.env.AWS_REGION,
        AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL
    });

    // Configuration options for ConfigProvider
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const configOptions = {
        configFolder: path.resolve(__dirname, '../../../config')
    };

    try {
        // Call main function directly with config options
        await testIntentHandler(configOptions);
        console.log('✅ Intent handler started successfully');
    } catch (error) {
        console.error('💥 Failed to start intent handler:', error);
        process.exit(1);
    }
}

// Run the test
runTest().then(() => {
    console.log('✅ Intent handler test completed successfully');
    // Note: In development mode, this will exit after processing available messages
    // In production mode, the service would run continuously and never reach this point
}).catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
});
