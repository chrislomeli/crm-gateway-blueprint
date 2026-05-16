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
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
