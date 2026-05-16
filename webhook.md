# Directory Package: webhook-subscriber
# Total files: 9
################################################################################

### FILE: Dockerfile
```
# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Set working directory
WORKDIR /app

# Copy root configuration files
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package files for current project structure
COPY packages/configuration/package.json ./packages/configuration/
COPY packages/core/package.json ./packages/core/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/framework/package.json ./packages/framework/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/services/package.json ./packages/services/
COPY packages/tsup-config/package.json ./packages/tsup-config/
COPY integrations/hubspot/package.json ./integrations/hubspot/
COPY services/webhook-subscriber/package.json ./services/webhook-subscriber/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/tsup-config ./packages/tsup-config
COPY packages/configuration ./packages/configuration
COPY packages/core ./packages/core
COPY packages/connectors ./packages/connectors
COPY packages/framework ./packages/framework
COPY packages/infrastructure ./packages/infrastructure
COPY packages/services ./packages/services
COPY integrations/hubspot ./integrations/hubspot
COPY services/webhook-subscriber ./services/webhook-subscriber

# Create cache directory for turbo
RUN mkdir -p /app/.turbo

# Build the project with turbo caching
RUN pnpm build --filter=@service/webhook-subscriber... --cache-dir=/app/.turbo

# Deploy the service to prepare for runtime (this resolves pnpm symlinks)
RUN pnpm --filter=@service/webhook-subscriber deploy --prod /app/deployed

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy the deployed service (with resolved dependencies)
COPY --from=builder /app/deployed ./

# Create config and secrets directories
RUN mkdir -p /config/shared /config/app /secrets/shared /secrets/app

# Create nodejs user and set ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /config /secrets

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/webhook-handler.js"]
```

### FILE: package.json
```
{
  "name": "@service/webhook-subscriber",
  "version": "1.0.0",
  "type": "module",
  "description": "Webhook subscriber service for processing HubSpot events and intent extraction",
  "main": "dist/webhook-handler.js",
  "scripts": {
    "build": "node_modules/.bin/tsup",
    "dev": "node_modules/.bin/tsup --watch --onSuccess 'node dist/index.js'",
    "start": "node dist/webhook-handler.js",
    "test": "vitest",
    "test:run": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@aws-sdk/client-sqs": "^3.0.0",
    "@platform/configuration": "workspace:*",
    "@platform/core": "workspace:*",
    "@platform/connectors": "workspace:*",
    "@platform/framework": "workspace:*",
    "@platform/infrastructure": "workspace:*",
    "@platform/services": "workspace:*",
    "@crm/hubspot": "workspace:*",
    "@hubspot/api-client": "^13.1.0",
    "axios": "^1.6.0",
    "compression": "^1.8.1",
    "cors": "^2.8.5",
    "dd-trace": "^5.0.0",
    "dotenv": "^17.2.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "hot-shots": "^11.2.0",
    "p-limit": "^4.0.0",
    "ts-toolbelt": "^9.6.0",
    "ulid": "^3.0.1",
    "uuid": "^9.0.0",
    "uuid4": "^2.0.3",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "@types/node": "^24.3.0",
    "@types/uuid": "^9.0.0",
    "@types/uuid4": "^2.0.3",
    "ts-node": "^10.9.2",
    "tsup": "^8.5.0",
    "typescript": "^5.9.2",
    "vitest": "^2.0.0"
  }
}
```

### FILE: tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",  // Change from "ESNext" to "ES2022"
    "moduleResolution": "node",  // Change from "bundler" to "node"
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

### FILE: tsup.config.ts
```
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    // Don't bundle - just transpile TypeScript to JavaScript
    bundle: false,
    splitting: false,
    outDir: 'dist',
    target: 'node18',
    platform: 'node',
    // Externalize Node.js built-ins so pino can access them
    external: ['os', 'fs', 'path', 'crypto', 'util', 'stream', 'events', 'buffer']
});
```

### FILE: vitest.config.js
```
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
    include: ['src/tests/**/*.{test,spec}.{js,ts}']
  },
  resolve: {
    alias: {
      '@': './src',
      '@tests': './src/tests',
      '@mocks': './src/tests/__mocks__'
    }
  }
})
```

### FILE: vitest.config.ts
```
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@platform/core': resolve(__dirname, '../../packages/core/src'),
      '@platform/configuration': resolve(__dirname, '../../packages/configuration/src'),
      '@platform/connectors': resolve(__dirname, '../../packages/connectors/src'),
      '@platform/framework': resolve(__dirname, '../../packages/framework/src'),
      '@platform/services': resolve(__dirname, '../../packages/services/src'),
    },
  },
});
```

### FILE: src/context-provider.ts
```
/**
 * context-provider.ts - Context Utilities for File Processors
 *
 * This file provides helper functions for gathering runtime, environment, and application context
 * information for the batch file processors. These utilities help with logging, debugging, and configuration.
 *
 * What does this file do?
 * - Collects environment and Git info for the batch processing repositories
 * - Provides context helpers for downstream processor logic using abstract context provider
 * - Defines default configuration values for the file processor service
 *
 * How do you use it?
 * - Import and use these helpers to enrich logs or pass context to processors
 *
 * Why is this important?
 * - Ensures processors have the right context for debugging and traceability
 * - Helps new developers understand what info is available about the running environment
 * - Centralizes configuration defaults for the file processor service
 *
 * @module apps/contact-sync/webhook-reader/contextProvider
 */


import {AbstractContextProvider, ApplicationContext} from "@platform/core";
import * as path from 'path';

/**
 * Concrete implementation of the context provider for File Processors
 */
export class FileProcessorsContextProvider extends AbstractContextProvider {
    // Singleton pattern
    private static instance: FileProcessorsContextProvider | null = null;

    // Define the complete application context directly
    private applicationContext: ApplicationContext = {
        identity: {
            appName: 'webhook-service',
            namespace: 'crm',
            integration: 'webhook',
            operation: 'webhook',
            serverMode: true, // Use server mode in Docker containers, one-shot for local development
            runtime: this.getRuntimeInfo(),
            version: {
                git: this.getGitInfo(),
                build: process.env.BUILD_ID
            }
        },
        appConfigDir: path.resolve(__dirname, '../config'),
        globalConfigs: {}
        // globalConfigs: {
        //     // Cache configuration
        //     cache: {
        //         type: 'hybrid',
        //         tableName: 'intents_cache',
        //         ttl: {
        //             seconds: 3600,
        //             maxStaleSeconds: 86400
        //         },
        //         inMemory: {
        //             maxSize: 1000
        //         },
        //         health: {
        //             maxAgeMinutes: 60,
        //             checkIntervalSeconds: 60
        //         }
        //     },
        //
        //     // Redis configuration
        //     redis: {
        //         host: 'localhost',
        //         port: 6379,
        //         password: '',
        //         db: 0,
        //         connectionTimeout: 5000,
        //         commandTimeout: 1000,
        //         cache: {
        //             maxAgeSeconds: 3600
        //         }
        //     },
        //
        //     // Logging configuration
        //     log: {
        //         level: 'DEBUG'
        //     },
        //
        //     // Decision API configuration
        //     decision: {
        //         api: {
        //             url: 'http://localhost:8080'
        //         }
        //     },
        //
        //     // Dataset configuration
        //     datasets: {
        //         contacts: {
        //             name: 'contacts'
        //         }
        //     },
        //
        //     // Worker configuration
        //     worker: {
        //         gracefulShutdownMs: true
        //     },
        //
        //     // SQS configuration
        //     sqs: {
        //         webhookQueueName: '',
        //         enabled: false,
        //         pollInterval: 1000,
        //         batchSize: 10,
        //         visibilityTimeout: 30
        //     },
        //
        //     // Legacy configs (keeping for backward compatibility)
        //     recordCount: 1000,
        //     pollingIntervalMs: 2000,
        //     maxRetries: 5,
        //     timeout: 10000
        // }
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): FileProcessorsContextProvider {
        if (!FileProcessorsContextProvider.instance) {
            FileProcessorsContextProvider.instance = new FileProcessorsContextProvider();
        }
        return FileProcessorsContextProvider.instance;
    }

    getApplicationContext(): ApplicationContext {
        return this.applicationContext;
    }
}

/**
 * Gets the application context for the file processors
 * Uses the abstract context provider for common functionality
 * 
 * @returns Application context object
 */
export function getApplicationContext(): ApplicationContext {
    return FileProcessorsContextProvider.getInstance().getApplicationContext();
}
```

### FILE: src/sqs-message.consumer.ts
```
/**
 * intent.consumer.ts
 *
 * Implements the MessageProcessor interface from the SQS subscriber library
 * to process SQS messages for HubSpot webhook event processing.
 */
import {ApplicationContext, isFailure, logger} from '@platform/core';
import { v4 as uuidv4 } from "uuid";
import {ConfigProvider} from "@platform/configuration";
import * as os from "os";
import {BaseSubscriber, MessageProcessor, SubscriberConfig} from "@platform/services";


/**
 * Set up the webhook subscriber
 * Set up the subscriber and start processing
 * Creates a MessageProcessor and passes it to the poller
 *
 */
export async function processWebhookMessages(messageProcessor: MessageProcessor, context: ApplicationContext) {
    try {

        // Initialize configuration status monitoring
        logger.info('Initializing configuration status monitoring...');
        await ConfigProvider.initialize();



        // Generate worker ID
        const workerId = `${os.hostname()}-${process.pid}-${uuidv4().substring(0, 8)}`;
        const gracefulShutdown = Number(5000) ;

        // Initialize publishing
        logger.info('Initializing publishing...');
        const serverMode = context.identity.serverMode ?? false;

        // Create SQS subscriber configuration
        const subscriberConfig: SubscriberConfig = {
            queueName: await ConfigProvider.get('sqs.webhookQueueName') as string,
            batchSize: Number(await ConfigProvider.get('sqs.batchSize', 100)),
            visibilityTimeout: Number(await ConfigProvider.get('sqs.visibilityTimeout',500)),
            pollInterval: Number(await ConfigProvider.get('sqs.pollInterval')),
            maxRetries: 3,
            oneShotMode: !serverMode,
            maxEmptyCycles: 3
        };

        if (serverMode) {
            // Create an always-up listener

            // Initialize and start SQS subscriber if enabled
            let sqsSubscriber: BaseSubscriber | null = null;

            logger.debug({
                queueName: subscriberConfig.queueName,
                batchSize: subscriberConfig.batchSize,
                visibilityTimeout: subscriberConfig.visibilityTimeout,
                pollInterval: subscriberConfig.pollInterval
            }, '🔄 Initializing SQS Subscriber');

            // Create SQS subscriber with tenant processing configuration
            sqsSubscriber = new BaseSubscriber(
                messageProcessor,
                subscriberConfig
            );

            // Set up error handler
            sqsSubscriber.onError((error) => {
                logger.error({ error }, '❌ SQS Subscriber Error');
                logger.error({
                    error,
                    queueName: subscriberConfig.queueName,
                    subscriberConfig
                }, 'SQS subscriber encountered an error');
            });

            const workerId = `${os.hostname()}-${process.pid}-${uuidv4().substring(0, 8)}`;

            // Set up message processed handler
            sqsSubscriber.onMessageProcessed((messageId, result) => {
                if (result.success) {
                    logger.info({ messageId }, '✅ SQS Message Processed Successfully');
                    if (result.outcome) {
                        result.outcome.forEach((output: Record<string, any>) => {
                            const result = output.value;
                            if (!result.success) {
                                logger.error({ result }, 'Processing error');
                            } else if (result.success && result.data.data) {
                                logger.info({ data: result.data.data }, 'Processing success');
                            } else {
                                logger.info({ message: result.message }, 'Processing skipped');
                            }
                        });
                    }


                } else {
                    logger.error({
                        error: result.error,
                        messageId,
                        queueName: subscriberConfig.queueName
                    }, 'SQS message processing failed');
                }
            });

            // Log every message received for debugging
            sqsSubscriber.onMessageReceived((messageId) => {
                logger.debug({ messageId }, '✅ Message Received');
            });

            await sqsSubscriber.start();
            logger.info({ queueName: subscriberConfig.queueName }, '✅ SQS Subscriber Started');

            // Set up graceful shutdown
            let isShuttingDown = false;

            const shutdown = async (signal: string) => {
                if (isShuttingDown) return;
                isShuttingDown = true;

                logger.info({workerId: workerId, signal}, 'Shutting down webhook service');

                // Stop SQS subscriber if running
                if (sqsSubscriber) {
                    logger.info('Stopping SQS subscriber...');
                    await sqsSubscriber.stop();
                    logger.info('SQS subscriber stopped');
                }

                // Wait for graceful shutdown
                setTimeout(() => {
                    logger.error({workerId: workerId}, 'Forced shutdown after timeout');
                    process.exit(1);
                }, gracefulShutdown);
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
        } else {
            // In one-shot mode, we'll process messages once and then exit
            logger.debug('Running in one-shot mode - will process available messages and then exit');

            try {
                // Create SQS subscriber with one-shot configuration
                const sqsSubscriber = new BaseSubscriber(
                    messageProcessor,
                    subscriberConfig
                );
                // Run in one-shot mode
                const processedCount = await sqsSubscriber.runOneShot();

                logger.info({ processedCount }, '✅ One-shot processing complete');

                // Exit with success code after processing
                process.exit(0);
            } catch (error) {
                logger.error({error}, 'Error during one-shot processing');
                process.exit(1);
            }
        }
    } catch (error) {
        logger.error({error}, 'Error starting batch importer service');
        process.exit(1);
    }
}
```

### FILE: src/webhook-handler.ts
```
/**
 * Webhook Processing Service
 *
 * Main entry point for the webhook processing service that handles HubSpot webhook events
 * from SQS queues for intent processing and other webhook-based workflows.
 */
import {ConfigProvider} from '@platform/configuration';
import {logger} from '@platform/core';
import {MySQLService} from '@platform/connectors';
import {DatabaseHealthChecks, HealthChecker, SQSHealthChecks, ElasticsearchHealthChecks} from '@platform/infrastructure';
import {getApplicationContext} from './context-provider';
import {processWebhookMessages} from "./sqs-message.consumer";
import {HubspotWebhookConsumer} from "@crm/hubspot";


/**
 * Main function - handles any local initialization then calls the consumer
 */
async function main() {
    try {

        await ConfigProvider.initialize();

        // Configure logger from config after initialization
        if (ConfigProvider.isInitialized()) {
            const logLevel = ConfigProvider.get('log.level') || 'DEBUG';
            logger.setLogLevel(logLevel);
        }

        // Set up health check server (always enabled for container observability)
        const port = ConfigProvider.get('batch.serverPort') || 3000;
        
        // Create health checker with proper configuration
        const healthChecker = new HealthChecker({ 
            serviceName: 'webhook-subscriber',
            version: '1.0.0',
            enableMetrics: true
        });
        
        // Add database health check
        healthChecker.addHealthCheck(DatabaseHealthChecks.createMySQLCheck(
            'acme',
            async () => MySQLService.acme,
            'SELECT 1'
        ));
        
        // Add SQS health checks for LocalStack
        const localstackConfig = ConfigProvider.get('localstack');
        const hubspotConfig = ConfigProvider.get('sqs.hubspot');
        if (localstackConfig && hubspotConfig?.webhookSingleQueueName) {
            const queueUrl = `${localstackConfig.endpoint}/000000000000/${hubspotConfig.webhookSingleQueueName}`;
            healthChecker.addHealthCheck(SQSHealthChecks.createQueueCheck(
                'webhook-single-queue',
                queueUrl
            ));
        }
        
        // Add Elasticsearch health check for real ES
        const opensearchConfig = ConfigProvider.get('opensearch');
        if (opensearchConfig?.esHost) {
            healthChecker.addHealthCheck(ElasticsearchHealthChecks.createHttpCheck(
                'production',
                opensearchConfig.esHost
            ));
        }
        
        // Start health check server
        await healthChecker.startServer(port);
        logger.info(`Health check server listening on port ${port}`);
        logger.info(`Health endpoints: /health/live, /health/ready, /health/startup, /health, /metrics`);

        // Now run the import batch process
        // Create a cache instance for the main process
        const context = getApplicationContext();
        const messageProcessor = new HubspotWebhookConsumer();
        await processWebhookMessages(messageProcessor, context);

    } catch (error) {
        logger.error({error}, 'Fatal error in main function');
        process.exit(1);
    }
}

// Start the service
main().catch(error => {
    logger.error( {error}, 'Fatal error in webhook service startup');
    process.exit(1);
});
```

