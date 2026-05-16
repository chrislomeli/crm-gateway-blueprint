/**
 * Simple Publisher Service
 *
 * Dead simple ESM-compliant REST interface that takes in webhook payloads
 * and forwards them to HubspotWebhookProcessor for processing.
 * Replaces NestJS with a simpler transport layer.
 */
import http from 'http';
import {URL} from 'url';
import path from 'path';
import {pkgUpSync} from 'pkg-up';
import {ConfigProvider, CONFIG} from '@platform/configuration';
import {getErrorInfo, logger} from '@platform/core';
import {MySQLService} from '@platform/connectors';
import {DatabaseHealthChecks, HealthChecker, SQSHealthChecks, ElasticsearchHealthChecks, ObservabilityFactory, SpanStatus} from '@platform/infrastructure';
import {ElasticsearchFacade} from '@platform/connectors';
import {HubspotUpdateEvent, HubspotWebhookProcessor} from '@crm/hubspot';

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

/**
 * Simple HTTP request body parser
 */
function parseRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            resolve(body);
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
function sendJsonResponse(res: http.ServerResponse, statusCode: number, data: any) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

/**
 * PublisherService - Encapsulates the HTTP REST server with robust startup patterns
 */
class PublisherService {
    private healthChecker?: HealthChecker;
    private httpServer?: http.Server;
    private webhookProcessor?: HubspotWebhookProcessor;
    private isShuttingDown = false;

    /**
     * Phase 1: Start health server only
     * This is the only startup phase that can crash the pod
     */
    async startServer(port: number): Promise<void> {
        logger.info({ port }, 'Phase 1: Starting health server');
        
        // Create health checker - focused only on pod health (not external dependencies)
        this.healthChecker = new HealthChecker({
            serviceName: 'simple-publisher',
            version: '1.0.0',
            enableMetrics: true
        });

        // Start health check server on a different port
        const healthPort = port + 1;
        await this.healthChecker.startServer(healthPort);
        logger.info({ healthPort }, 'Health check server started');
        logger.info(`Health endpoints: /health/live, /health/ready, /health/startup, /health, /metrics`);
    }

    /**
     * Phase 2: Start application logic (HTTP server) with retry patterns
     * This phase uses retry logic and won't crash the pod on failure
     */
    async startApplication(options: ServiceOptions = {}): Promise<void> {
        const {
            testMode = false,
            maxRetries = 5,
            retryDelayMs = 10000,
            configOptions
        } = options;

        logger.info({ 
            testMode, 
            maxRetries: testMode ? 'unlimited' : maxRetries, 
            retryDelayMs 
        }, 'Phase 2: Starting application logic with retry patterns');

        let attempt = 0;
        const startTime = Date.now();

        while (true) {
            attempt++;
            const attemptStartTime = Date.now();

            try {
                logger.info({ attempt, testMode }, 'Starting application logic attempt');
                
                await this.initializeApplication(configOptions);
                
                const elapsedMs = Date.now() - startTime;
                logger.info({ 
                    attempt, 
                    elapsedMs,
                    testMode 
                }, 'Application logic started successfully');
                return;

            } catch (error) {
                const attemptElapsedMs = Date.now() - attemptStartTime;
                const totalElapsedMs = Date.now() - startTime;
                const errorInfo = getErrorInfo(error);

                logger.error({
                    attempt,
                    maxRetries: testMode ? 'unlimited' : maxRetries,
                    attemptElapsedMs,
                    totalElapsedMs,
                    testMode,
                    error: errorInfo
                }, 'Application logic startup attempt failed');

                // In test mode, retry indefinitely
                if (testMode) {
                    logger.info({ 
                        retryDelayMs, 
                        nextAttempt: attempt + 1 
                    }, 'Test mode: retrying indefinitely after delay');
                    await this.sleep(retryDelayMs);
                    continue;
                }

                // In production mode, respect retry limits
                if (attempt >= maxRetries) {
                    logger.error({
                        attempt,
                        maxRetries,
                        totalElapsedMs,
                        testMode: false,
                        error: errorInfo
                    }, 'Application logic startup failed after maximum retries - exiting gracefully');
                    
                    // Graceful exit - let Kubernetes restart the pod
                    process.exit(1);
                }

                logger.info({ 
                    retryDelayMs, 
                    nextAttempt: attempt + 1, 
                    remainingRetries: maxRetries - attempt 
                }, 'Production mode: retrying after delay');
                await this.sleep(retryDelayMs);
            }
        }
    }

    /**
     * Initialize the application components (config, observability, HTTP server)
     */
    private async initializeApplication(configOptions?: any): Promise<void> {
        // Find project root and construct config path
        const packageJsonPath = pkgUpSync();
        if (!packageJsonPath) {
            throw new Error('Could not find project root (package.json)');
        }
        const projectRoot = path.dirname(packageJsonPath);
        const configPath = path.join(projectRoot, 'config');
        
        const config = await ConfigProvider.initialize(configOptions);
        logger.info('ConfigProvider initialized');

        // Configure logger from config after initialization
        if (ConfigProvider.isInitialized()) {
            const logLevel = ConfigProvider.get(CONFIG.LOG_LEVEL) || 'info';
            logger.setLogLevel(logLevel);
        }

        // Get configuration
        const port = ConfigProvider.get(CONFIG.BATCH_SERVER_PORT) || 3000;
        const localstackConfig = ConfigProvider.get(CONFIG.SHARED_LOCALSTACK);
        
        if (!localstackConfig) {
            logger.info({ port, mode: 'cloud' }, 'Running in production/cloud mode');
        } else {
            logger.info({ port, localstackConfig, mode: 'localstack' }, 'Running in LocalStack mode');
        }

        // Initialize observability with configurable provider
        const observabilityProvider = ConfigProvider.get(CONFIG.OBSERVABILITY_PROVIDER);
        const tracingEnabled = ConfigProvider.get(CONFIG.OBSERVABILITY_TRACING_ENABLED) === 'true';
        const metricsEnabled = ConfigProvider.get(CONFIG.OBSERVABILITY_METRICS_ENABLED) === 'true';
        
        await ObservabilityFactory.initialize({
            provider: observabilityProvider,
            tracing: { enabled: tracingEnabled, type: observabilityProvider },
            metrics: { enabled: metricsEnabled, type: observabilityProvider }
        });
        logger.info(`Observability initialized with ${observabilityProvider} provider`);

        // Initialize HubSpot webhook processor (queue URLs resolved JIT)
        this.webhookProcessor = new HubspotWebhookProcessor();

        // Add diagnostic checks for external dependencies (separate from health checks)
        if (this.healthChecker) {
            this.addDiagnosticChecks();
        }

        // Create and start HTTP server
        await this.startHttpServer(port);
    }

    /**
     * Add diagnostic checks for external dependencies
     */
    private addDiagnosticChecks(): void {
        if (!this.healthChecker) return;

        // Database diagnostic check
        this.healthChecker.addDiagnosticCheck(DatabaseHealthChecks.createMySQLCheck(
            'mysql_database',
            async () => MySQLService.CALLS,
            'SELECT 1'
        ));

        // SQS diagnostic checks for HubSpot queues
        const hubspotConfig = ConfigProvider.get(CONFIG.HUBSPOT_SQS_QUEUES);
        if (hubspotConfig) {
            if (hubspotConfig.singleQueueName) {
                this.healthChecker.addDiagnosticCheck(SQSHealthChecks.createQueueNameCheck(
                    'hubspot-single-queue',
                    hubspotConfig.singleQueueName
                ));
            }
            if (hubspotConfig.importQueueName) {
                this.healthChecker.addDiagnosticCheck(SQSHealthChecks.createQueueNameCheck(
                    'hubspot-import-queue',
                    hubspotConfig.importQueueName
                ));
            }
            if (hubspotConfig.intentQueueName) {
                this.healthChecker.addDiagnosticCheck(SQSHealthChecks.createQueueNameCheck(
                    'hubspot-intent-queue',
                    hubspotConfig.intentQueueName
                ));
            }
        }

        // Elasticsearch diagnostic check - simple connectivity test
        this.healthChecker.addDiagnosticCheck({
            name: 'elasticsearch_cluster',
            check: async () => {
                try {
                    // Test connectivity and permissions by listing indices
                    const listResult = await ElasticsearchFacade.listIndices();
                    
                    if (listResult.success) {
                        const indices = listResult.data || [];
                        return {
                            status: 'healthy',
                            message: `OpenSearch cluster accessible - found ${indices.length} indices`,
                            details: {
                                cluster: 'search-cluster',
                                indices_accessible: true,
                                index_count: indices.length,
                                sample_indices: indices.slice(0, 3).map(idx => idx.index || idx),
                                timestamp: new Date().toISOString()
                            }
                        };
                    } else {
                        return {
                            status: 'unhealthy',
                            message: `OpenSearch connectivity failed: ${listResult.error}`,
                            details: {
                                cluster: 'search-cluster',
                                indices_accessible: false,
                                index_count: 0,
                                sample_indices: [],
                                timestamp: new Date().toISOString()
                            }
                        };
                    }
                } catch (error) {
                    return {
                        status: 'unhealthy',
                        message: `Elasticsearch cluster connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        details: {
                            cluster: 'search-cluster',
                            error: error instanceof Error ? error.message : 'Unknown error',
                            timestamp: new Date().toISOString()
                        }
                    };
                }
            }
        });
    }

    /**
     * Start the HTTP server
     */
    private async startHttpServer(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            // Create HTTP server
            this.httpServer = http.createServer(async (req, res) => {
                try {
                    await this.handleRequest(req, res);
                } catch (error) {
                    logger.error({ error: getErrorInfo(error) }, 'Unhandled request error');
                    sendJsonResponse(res, 500, { error: 'Internal server error' });
                }
            });

            // Start the HTTP server
            this.httpServer.listen(port, () => {
                logger.info({ port }, 'HTTP server started successfully');
                logger.info('Available endpoints:');
                logger.info('  POST /webhook - Process HubSpot webhook events');
                logger.info('  GET  /health  - Health check');
                resolve();
            });

            this.httpServer.on('error', (error) => {
                logger.error({ error: getErrorInfo(error), port }, 'HTTP server failed to start');
                reject(error);
            });
        });
    }

    /**
     * Handle HTTP requests
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const method = req.method || 'GET';

        logger.info({ method, pathname: url.pathname }, 'Incoming request');

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
            return;
        }

        // Temporary simple health endpoint for debugging
        if (url.pathname === '/health') {
            sendJsonResponse(res, 200, { 
                status: 'healthy', 
                service: 'simple-publisher', 
                timestamp: new Date().toISOString() 
            });
            return;
        }

        // Webhook endpoint
        if (url.pathname === '/webhook' && method === 'POST') {
            await this.handleWebhookRequest(req, res);
            return;
        }

        // Default 404
        sendJsonResponse(res, 404, { error: 'Not found' });
    }

    /**
     * Handle webhook requests
     */
    private async handleWebhookRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const body = await parseRequestBody(req);
        
        if (!body) {
            sendJsonResponse(res, 400, { error: 'Request body is required' });
            return;
        }

        let events: HubspotUpdateEvent[];
        try {
            events = JSON.parse(body);
            if (!Array.isArray(events)) {
                throw new Error('Request body must be an array of HubspotUpdateEvent objects');
            }
        } catch (parseError) {
            logger.error({ error: getErrorInfo(parseError), body }, 'Failed to parse request body');
            sendJsonResponse(res, 400, { error: 'Invalid JSON in request body' });
            return;
        }

        // Process webhook events
        try {
            logger.info({ eventCount: events.length }, 'Processing webhook events');
            const result = await this.webhookProcessor!.processAndSendWebhookBatch(events);
            
            logger.info(result, 'Webhook processing completed');
            sendJsonResponse(res, 200, result);
        } catch (processingError) {
            logger.error({ error: getErrorInfo(processingError) }, 'Failed to process webhook events');
            sendJsonResponse(res, 500, { 
                error: 'Failed to process webhook events',
                details: processingError instanceof Error ? processingError.message : 'Unknown error'
            });
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(signal: string): Promise<void> {
        if (this.isShuttingDown) {
            logger.info('Shutdown already in progress, ignoring signal');
            return;
        }

        this.isShuttingDown = true;
        logger.info({ signal }, 'Received shutdown signal, closing servers gracefully');

        // Close HTTP server
        if (this.httpServer) {
            await new Promise<void>((resolve) => {
                this.httpServer!.close(() => {
                    logger.info('HTTP server closed');
                    resolve();
                });
            });
        }

        // Close health server
        if (this.healthChecker) {
            await this.healthChecker.gracefulShutdown();
            await this.healthChecker.stopServer();
            logger.info('Health server shutdown completed');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Main function - uses the new two-phase startup pattern
 */
async function main() {
    const defaultPort = 3000; // Will be overridden by config during initialization
    const service = new PublisherService();

    // Setup graceful shutdown handlers
    const shutdown = async (signal: string) => {
        await service.shutdown(signal);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR1', () => shutdown('SIGUSR1')); // Manual shutdown for development

    try {
        // Phase 1: Start health server (only allowed to crash pod)
        await service.startServer(defaultPort);

        // Phase 2: Start application logic with retry patterns
        const testMode = isTestMode();
        await service.startApplication({
            testMode,
            maxRetries: 5,
            retryDelayMs: 10000
        });

        // Keep the process alive
        logger.info('Service initialization complete, keeping process alive...');
        return new Promise(() => {
            // This promise never resolves, keeping the process alive
            // The process will only exit via shutdown signals or errors
        });

    } catch (error) {
        const errorInfo = getErrorInfo(error);
        logger.error({
            error: errorInfo,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, 'Fatal error in main function');
        process.exit(1);
    }
}

/**
 * Legacy main function for backward compatibility
 * @deprecated Use the new PublisherService class directly
 */
export async function callSimplePublisher(options?: any) {
    logger.info('Using legacy callSimplePublisher function - consider migrating to PublisherService class');
    return main();
}

// Start the service
main().catch(error => {
    const errorInfo = getErrorInfo(error);
    logger.error({
        error: errorInfo,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    }, 'Fatal error in simple publisher startup');
    process.exit(1);
});
