/**
 * Intent Processing Service
 *
 * Main entry point for the intent processing service that handles HubSpot webhook events
 * from SQS queues for intent processing and other webhook-based workflows.
 */
import {ConfigProvider, CONFIG} from '@platform/configuration';
import {getErrorInfo, logger} from '@platform/core';
import {MySQLService} from '@platform/connectors';
import {HealthChecker, DatabaseHealthChecks, SQSHealthChecks, ElasticsearchHealthChecks, ObservabilityFactory} from '@platform/infrastructure';
import {getApplicationContext} from './context-provider';
import {processWebhookMessages} from "./sqs-message-consumer";
import {HubspotIntentProcessor} from "@crm/hubspot";

interface ServiceOptions {
    testMode?: boolean;    // Determined by environment detection function
    maxRetries?: number;   // Default: 3, ignored if testMode=true
    retryDelayMs?: number; // Default: 5000
    configOptions?: any;   // Options to pass to ConfigProvider.initialize()
}

/**
 * Deterministic environment detection function
 * This is the single source of truth for test vs production behavior
 */
function isTestMode(): boolean {
    const nodeEnv = process.env.NODE_ENV;
    
    // Rule 1: If NODE_ENV is undefined, we are in test mode
    if (nodeEnv === undefined) {
        logger.info('Environment detection: NODE_ENV is undefined -> TEST MODE');
        return true;
    }
    
    // Rule 2: If lowercase NODE_ENV starts with 'dev', we are in test mode
    const lowerEnv = nodeEnv.toLowerCase();
    if (lowerEnv.startsWith('dev')) {
        logger.info(`Environment detection: NODE_ENV='${nodeEnv}' starts with 'dev' -> TEST MODE`);
        return true;
    }
    
    // Rule 3: Everything else is production mode
    logger.info(`Environment detection: NODE_ENV='${nodeEnv}' -> PRODUCTION MODE`);
    return false;
}

export class IntentService {
    private healthServer?: HealthChecker;
    private isShuttingDown = false;
    
    /**
     * Phase 1: Start the health server - ONLY thing allowed to crash the pod
     * This is the "manageable crash" - if we can't serve health checks, pod should die
     */
    async startServer(port: number): Promise<void> {
        try {
            this.healthServer = new HealthChecker({
                serviceName: 'intent-subscriber',
                version: '1.0.0',
                enableMetrics: true
            });
            
            await this.healthServer.startServer(port);
            logger.info(`Health server started on port ${port} - pod is now "alive"`);
            logger.info(`Health endpoints: /health/live, /health/ready, /health/startup, /health, /metrics, /config, /health/shutdown`);
            
        } catch (error) {
            logger.error('Failed to start health server - this is a fatal error');
            throw error; // Let this crash the pod - it's the only acceptable crash
        }
    }
    
    /**
     * Phase 2: Start application logic with retry/test mode pattern
     * This wraps all the "business logic" and handles failures gracefully
     */
    async startApplication(options: ServiceOptions = {}): Promise<void> {
        const { 
            testMode = isTestMode(),      // Use deterministic environment detection
            maxRetries = 3, 
            retryDelayMs = 5000,
            configOptions
        } = options;
        
        let attempt = 0;
        
        logger.info(`Application startup mode: ${testMode ? 'TEST' : 'PRODUCTION'}`);
        logger.info(`Max retries: ${testMode ? 'UNLIMITED' : maxRetries}`);
        
        while (true) {
            try {
                attempt++;
                logger.info(`Starting application logic (attempt ${attempt})`);
                
                // All the risky initialization that could fail
                await this.initializeApplication(configOptions);
                
                // Start the main execution loop
                await this.runExecutionLoop();
                
                // If we get here, something ended the loop (shutdown signal)
                break;
                
            } catch (error) {
                logger.error(getErrorInfo(error), `Application startup failed (attempt ${attempt}):`);
                
                // In production mode, give up after maxRetries and exit gracefully
                if (!testMode && attempt >= maxRetries) {
                    logger.error(`Production mode: Max retries (${maxRetries}) exceeded.`);
                    logger.error('Application cannot start - exiting gracefully to allow pod restart');
                    
                    // Log final status for monitoring/alerting
                    logger.error({
                        service: 'intent-subscriber',
                        event: 'graceful_exit_after_retries',
                        attempts: attempt,
                        maxRetries: maxRetries,
                        lastError: error instanceof Error ? {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        } : error
                    }, 'Service exiting gracefully after exhausting retries');
                    
                    // Exit gracefully - let Kubernetes restart the pod
                    process.exit(1);
                }
                
                if (this.isShuttingDown) {
                    logger.info('Shutdown requested, stopping retry attempts');
                    break;
                }
                
                const delay = testMode ? retryDelayMs : retryDelayMs * attempt;
                const modeText = testMode ? 'TEST MODE - retrying indefinitely' : `PRODUCTION MODE - ${maxRetries - attempt} retries remaining`;
                logger.info(`Retrying in ${delay}ms... (${modeText})`);
                await this.sleep(delay);
            }
        }
    }
    
    /**
     * Initialize all the risky dependencies - can fail safely
     */
    private async initializeApplication(configOptions?: any): Promise<void> {
        // Config initialization
        await ConfigProvider.initialize(configOptions);
        
        // Logger setup
        if (ConfigProvider.isInitialized()) {
            const logLevel = ConfigProvider.get(CONFIG.LOG_LEVEL) || 'info';
            logger.setLogLevel(logLevel);
        }
        
        // Observability (can fail)
        await this.initializeObservability();
        
        // Add diagnostic checks (these don't affect pod health)
        await this.setupDiagnosticChecks();
        
        logger.info('Application initialization completed successfully');
    }
    
    /**
     * Initialize observability with configurable provider
     */
    private async initializeObservability(): Promise<void> {
        const observabilityProvider = ConfigProvider.get(CONFIG.OBSERVABILITY_PROVIDER);
        const tracingEnabled = ConfigProvider.get(CONFIG.OBSERVABILITY_TRACING_ENABLED) === 'true';
        const metricsEnabled = ConfigProvider.get(CONFIG.OBSERVABILITY_METRICS_ENABLED) === 'true';
        
        await ObservabilityFactory.initialize({
            provider: observabilityProvider,
            tracing: { enabled: tracingEnabled, type: observabilityProvider },
            metrics: { enabled: metricsEnabled, type: observabilityProvider }
        });
        logger.info(`Observability initialized with ${observabilityProvider} provider`);
    }
    
    /**
     * Setup diagnostic checks for external dependencies
     * These are accessible via /diagnostics/* endpoints and don't affect pod lifecycle
     */
    private async setupDiagnosticChecks(): Promise<void> {
        if (!this.healthServer) {
            throw new Error('Health server must be started before adding diagnostic checks');
        }
        
        // Database diagnostic check
        this.healthServer.addDiagnosticCheck(DatabaseHealthChecks.createMySQLCheck(
            'mysql_database',
            async () => MySQLService.CALLS,
            'SELECT 1'
        ));

        // SQS diagnostic checks for LocalStack
        const localstackConfig = ConfigProvider.get(CONFIG.LOCALSTACK_LEGACY);
        logger.info(localstackConfig, `LOCAL STACK CONFIG`);

        const hubspotConfig = ConfigProvider.get(CONFIG.SHARED_SQS_HUBSPOT);
        logger.info(hubspotConfig, `SQS CONFIG`);

        if (localstackConfig && hubspotConfig?.intentQueueName) {
            const queueUrl = `${localstackConfig.endpoint}/000000000000/${hubspotConfig.intentQueueName}`;
            this.healthServer.addDiagnosticCheck(SQSHealthChecks.createQueueCheck(
                'intent-queue',
                queueUrl
            ));
        }

        // Elasticsearch diagnostic check for real ES (skip in local development)
        const opensearchConfig = ConfigProvider.get(CONFIG.OPENSEARCH_LEGACY);
        logger.info(opensearchConfig, `opensearchConfig CONFIG`);

        // Only add Elasticsearch diagnostic check if not pointing to LocalStack
        if (opensearchConfig?.esHost && !opensearchConfig.esHost.includes('localstack')) {
            this.healthServer.addDiagnosticCheck(ElasticsearchHealthChecks.createHttpCheck(
                'elasticsearch_production',
                opensearchConfig.esHost
            ));
        } else {
            logger.info('Skipping Elasticsearch diagnostic check in local development (LocalStack detected)');
        }
    }
    
    /**
     * Main execution loop - handles work processing
     */
    private async runExecutionLoop(): Promise<void> {
        logger.info('Starting main execution loop');
        
        // Create application context
        const context = getApplicationContext();
        const messageProcessor = new HubspotIntentProcessor();
        
        // This is where your actual work happens
        await processWebhookMessages(messageProcessor, context);
    }
    
    /**
     * Graceful shutdown - can be called manually or via signal
     */
    async shutdown(): Promise<void> {
        logger.info('Initiating graceful shutdown...');
        this.isShuttingDown = true;
        
        if (this.healthServer) {
            // Gracefully shutdown the health server
            await this.healthServer.gracefulShutdown();
            await this.healthServer.stopServer();
            logger.info('Health server shutdown completed');
        }
        
        // Give time for in-flight work to complete
        await this.sleep(5000);
        
        logger.info('Shutdown complete');
        process.exit(0);
    }
    
    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Main function - uses deterministic environment detection
 */
async function main(options?: any) {
    const service = new IntentService();
    const defaultPort = 3001; // Will be overridden by config during initialization
    
    // Use deterministic environment detection
    const testMode = isTestMode();
    
    try {
        // Phase 1: Start health server (only acceptable crash point)
        await service.startServer(defaultPort);
        
        // Setup graceful shutdown handlers
        setupShutdownHandlers(service);
        
        // Phase 2: Start application with deterministic settings
        await service.startApplication({
            testMode: testMode,
            maxRetries: 5,  // Only used in production mode
            retryDelayMs: 10000,
            configOptions: options
        });
        
    } catch (error) {
        logger.error(getErrorInfo(error),'Service failed to start:');
        process.exit(1);
    }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupShutdownHandlers(service: IntentService) {
    // Standard shutdown signals
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM - initiating graceful shutdown');
        await service.shutdown();
    });
    
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT - initiating graceful shutdown');
        await service.shutdown();
    });
    
    // Manual shutdown for R&D (kill -USR1 <pid>)
    process.on('SIGUSR1', async () => {
        logger.info('Received SIGUSR1 - manual shutdown requested');
        await service.shutdown();
    });
    
    // Catch uncaught exceptions but don't crash the pod
    process.on('uncaughtException', (error) => {
        logger.error(getErrorInfo(error),'Uncaught exception:');
        // Don't exit - let the retry logic handle it
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        logger.error({reason, promise},'Unhandled rejection at:');
        // Don't exit - let the retry logic handle it
    });
}

// Start the service only if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('intent-handler.ts')) {
    main().catch(error => {
        const errorInfo = getErrorInfo(error);
        logger.error({
            error: errorInfo,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, 'Fatal error in intent service startup');
        process.exit(1);
    });
}
