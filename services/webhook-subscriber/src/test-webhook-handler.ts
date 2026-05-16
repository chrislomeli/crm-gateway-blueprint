#!/usr/bin/env tsx
/**
 * Quick test file for webhook-handler
 * Sets environment variables and calls main() function directly
 */

// Set environment variables for local testing
import {ConfigProvider} from "@platform/configuration";
import {logger} from "@platform/core";
import {DatabaseHealthChecks, HealthChecker, SQSHealthChecks} from "@platform/infrastructure";
import {MySQLService} from "@platform/connectors";
import {HubSpotRepository, HubspotWebhookConsumer, MockContactRepository} from "@crm/hubspot";
import {getApplicationContext} from "./context-provider";
import {processWebhookMessages} from "./sqs-message.consumer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pkgUpSync } from "pkg-up";

process.env.NODE_ENV = 'development';
process.env.AWS_REGION = 'us-west-2';
// process.env.AWS_ENDPOINT_URL = 'http://localhost:30566'; // LocalStack endpoint

// Import the main function directly
export async function testWebhookHandler(options?: any) {
    try {

        await ConfigProvider.initialize(options);

        // Configure logger from config after initialization
        if (ConfigProvider.isInitialized()) {
            const logLevel = ConfigProvider.get('log.level') || 'debug';
            logger.setLogLevel(logLevel);
        }

        // Dump the database connection
        const configs = ConfigProvider.get('');
        logger.info(JSON.stringify(configs))



        // Set up health check server (always enabled for container observability)
        const port = ConfigProvider.get('batch.serverPort') || 3000;
        logger.info(`Health check server listening on port ${port}`);

        // Create health checker with proper configuration
        const healthChecker = new HealthChecker({
            serviceName: 'webhook-subscriber',
            version: '1.0.0',
            enableMetrics: true
        });

        // Add database health check
        healthChecker.addHealthCheck(DatabaseHealthChecks.createMySQLCheck(
            'calls',
            async () => MySQLService.CALLS,
            'SELECT 1'
        ));

        // Add SQS health checks for LocalStack
        const localstackConfig = ConfigProvider.get('localstack');
        logger.info(localstackConfig, `LOCAL STACK CONFIG`);


        const hubspotConfig = ConfigProvider.get('shared.sqs.hubspot');
        logger.info(hubspotConfig, `SQS CONFIG`);


        if (localstackConfig && hubspotConfig?.webhookSingleQueueName) {
            const queueUrl = `${localstackConfig.endpoint}/000000000000/${hubspotConfig.webhookSingleQueueName}`;
            healthChecker.addHealthCheck(SQSHealthChecks.createQueueCheck(
                'webhook-single-queue',
                queueUrl
            ));
        }

        // Add Elasticsearch health check for real ES - TEMPORARILY DISABLED
        // const opensearchConfig = ConfigProvider.get('opensearch');
        // logger.info(opensearchConfig, `opensearchConfig CONFIG`);

        // if (opensearchConfig?.esHost) {
        //     healthChecker.addHealthCheck(ElasticsearchHealthChecks.createHttpCheck(
        //         'production',
        //         opensearchConfig.esHost
        //     ));
        // }


        // Start health check server
        await healthChecker.startServer(port);
        logger.info(`Health check server listening on port ${port}`);
        logger.info(`Health endpoints: /health/live, /health/ready, /health/startup, /health, /metrics`);

        // Now run the webhook processing with mock repository for local testing
        // Create mock repository for local development/testing
        const mockContactRepo = new HubSpotRepository();

        // Create a cache instance for the main process
        const context = getApplicationContext();
        const messageProcessor = new HubspotWebhookConsumer(mockContactRepo);
        await processWebhookMessages(messageProcessor, context);

    } catch (error) {
        logger.error({
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error
        }, 'Fatal error in main function');
        console.error('Raw error:', error);
        process.exit(1);
    }
}

async function runTest() {
    console.log('🧪 Starting webhook-handler test...');
    console.log('📍 Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        AWS_REGION: process.env.AWS_REGION,
        AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL
    });

    // Find project root using robust search for main project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Search for the main project root (the one with pnpm-workspace.yaml and config folder)
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
    const configOptions = {
        configFolder: path.join(projectRoot, 'config')
    };
    
    console.log('📁 Project root:', projectRoot);
    console.log('⚙️ Config folder:', configOptions.configFolder);

    try {
        // Call main function directly with config options
        await testWebhookHandler(configOptions);
        console.log('✅ Webhook handler started successfully');
    } catch (error) {
        console.error('💥 Failed to start webhook handler:', error);
        process.exit(1);
    }
}

// Run the test
runTest().then(() => {
    console.log('✅ Webhook handler test completed successfully');
    // Note: In development mode, this will exit after processing available messages
    // In production mode, the service would run continuously and never reach this point
}).catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
});
