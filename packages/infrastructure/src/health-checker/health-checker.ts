import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { URL } from 'url';
import * as os from 'os';
import { HealthCheck, HealthMetrics, HealthCheckerOptions } from './types';
import { ConfigProvider, CONFIG } from '@platform/configuration';

export class HealthChecker {
  private serviceName: string;
  private version: string;
  public customChecks: HealthCheck[];
  private enableMetrics: boolean;
  private gracefulShutdownTimeoutMs: number;
  private startTime: Date;
  private isShuttingDown: boolean = false;
  private metrics: HealthMetrics = {};
  private activityCount: number = 0;
  private lastActivity: Date;
  private server?: Server;
  
  // Graceful degradation settings
  private maxHealthCheckRetries: number;
  private healthCheckRetryDelayMs: number;
  private failureToleranceCount: number;
  private consecutiveFailures: Map<string, number> = new Map();
  private lastSuccessfulCheck: Map<string, Date> = new Map();
  
  // R&D troubleshooting configuration
  private forceShutdownEnabled: boolean;
  private forceShutdownRequested: boolean = false;
  
  // Diagnostic checks (separate from health checks)
  public diagnosticChecks: HealthCheck[] = [];

  constructor(options: HealthCheckerOptions = {}) {
    this.serviceName = options.serviceName || 'unknown-service';
    this.version = options.version || '1.0.0';
    this.customChecks = options.customChecks || [];
    this.enableMetrics = options.enableMetrics !== false;
    this.gracefulShutdownTimeoutMs = options.gracefulShutdownTimeoutMs || 30000;
    this.startTime = new Date();
    
    // Graceful degradation configuration with environment variable support
    // Priority: options > process.env > ConfigProvider (if available) > defaults
    this.maxHealthCheckRetries = options.maxHealthCheckRetries ?? 
      parseInt(process.env.HEALTH_CHECK_MAX_RETRIES || this.getConfigFallback('HEALTH_CHECK_MAX_RETRIES', '3'));
    this.healthCheckRetryDelayMs = options.healthCheckRetryDelayMs ?? 
      (parseInt(process.env.HEALTH_CHECK_RETRY_INTERVAL_SECONDS || this.getConfigFallback('HEALTH_CHECK_RETRY_INTERVAL_SECONDS', '30')) * 1000);
    this.failureToleranceCount = options.failureToleranceCount || 5;
    this.lastActivity = new Date();
    
    // R&D troubleshooting configuration
    this.forceShutdownEnabled = options.forceShutdownEnabled ?? 
      (process.env.HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED || this.getConfigFallback('HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED', 'false')) === 'true';
  }

  /**
   * Safely get configuration from ConfigProvider with fallback
   * This allows health checker to work even if ConfigProvider isn't initialized
   */
  private getConfigFallback(key: string, defaultValue: string): string {
    try {
      return ConfigProvider.getRaw(key, defaultValue);
    } catch (error) {
      // ConfigProvider not initialized or other error - use default
      return defaultValue;
    }
  }

  /**
   * Start the health check HTTP server
   */
  public startServer(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));
      
      this.server.on('error', reject);
      
      this.server.listen(port, () => {
        console.log(`HealthChecker server listening on port ${port}`);
        console.log(`Health endpoints: /health/live, /health/ready, /health/startup, /health, /metrics`);
        resolve();
      });
    });
  }

  /**
   * Stop the health check server
   */
  public stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const method = req.method?.toLowerCase();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'options') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (method !== 'get') {
      this.sendResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      switch (url.pathname) {
        case '/health/live':
          await this.handleLiveness(res);
          break;
        case '/health/ready':
          await this.handleReadiness(res);
          break;
        case '/health/startup':
          await this.handleStartup(res);
          break;
        case '/health':
          await this.handleDetailedHealth(res);
          break;
        case '/metrics':
          await this.handleMetrics(res);
          break;
        case '/config':
          await this.handleConfig(res);
          break;
        case '/health/shutdown':
          await this.handleForceShutdown(res);
          break;
        case '/diagnostics':
          await this.handleDiagnostics(res);
          break;
        case '/diagnostics/database':
          await this.handleDatabaseDiagnostic(res);
          break;
        case '/diagnostics/sqs':
          await this.handleSQSDiagnostic(res);
          break;
        case '/diagnostics/all':
          await this.handleAllDiagnostics(res);
          break;
        default:
          this.sendResponse(res, 404, { error: 'Not found' });
      }
    } catch (error) {
      this.sendResponse(res, 500, { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send JSON response
   */
  private sendResponse(res: ServerResponse, statusCode: number, data: any): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Add a custom health check
   */
  public addHealthCheck(check: HealthCheck): void {
    this.customChecks.push(check);
  }

  /**
   * Record activity for metrics
   */
  public recordActivity(activity?: string): void {
    this.activityCount++;
    this.lastActivity = new Date();
    if (activity && this.enableMetrics) {
      const key = `activity_${activity}`;
      this.metrics[key] = (this.metrics[key] as number || 0) + 1;
    }
  }

  /**
   * Set custom metric
   */
  public setMetric(key: string, value: number | string | boolean): void {
    if (this.enableMetrics) {
      this.metrics[key] = value;
    }
  }

  /**
   * Execute health check with retry logic and failure tolerance
   */
  private async executeHealthCheckWithRetry(healthCheck: HealthCheck): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded'; message?: string; details?: any; retryCount?: number }> {
    const checkName = healthCheck.name;
    let lastError: any;
    
    for (let attempt = 0; attempt < this.maxHealthCheckRetries; attempt++) {
      try {
        const result = await healthCheck.check();
        
        if (result.status === 'healthy') {
          // Reset failure count on success
          this.consecutiveFailures.set(checkName, 0);
          this.lastSuccessfulCheck.set(checkName, new Date());
          return result;
        } else {
          lastError = result;
        }
      } catch (error) {
        lastError = error;
        console.warn(`Health check '${checkName}' failed on attempt ${attempt + 1}:`, error);
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < this.maxHealthCheckRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, this.healthCheckRetryDelayMs));
      }
    }
    
    // All retries failed - update failure tracking
    const currentFailures = (this.consecutiveFailures.get(checkName) || 0) + 1;
    this.consecutiveFailures.set(checkName, currentFailures);
    
    // Check if we should return degraded instead of unhealthy
    const lastSuccess = this.lastSuccessfulCheck.get(checkName);
    const timeSinceLastSuccess = lastSuccess ? Date.now() - lastSuccess.getTime() : Infinity;
    const gracePeriodMs = this.failureToleranceCount * this.healthCheckRetryDelayMs * this.maxHealthCheckRetries;
    
    if (currentFailures <= this.failureToleranceCount || timeSinceLastSuccess < gracePeriodMs) {
      return {
        status: 'degraded',
        message: `Health check failing but within tolerance (${currentFailures}/${this.failureToleranceCount} failures)`,
        details: { 
          lastError: lastError instanceof Error ? lastError.message : lastError,
          consecutiveFailures: currentFailures,
          timeSinceLastSuccess: timeSinceLastSuccess,
          retryCount: this.maxHealthCheckRetries
        }
      };
    }
    
    return {
      status: 'unhealthy',
      message: `Health check failed after ${this.maxHealthCheckRetries} retries`,
      details: { 
        lastError: lastError instanceof Error ? lastError.message : lastError,
        consecutiveFailures: currentFailures,
        retryCount: this.maxHealthCheckRetries
      }
    };
  }

  /**
   * Initiate graceful shutdown
   */
  public async gracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Wait for graceful shutdown timeout
    await new Promise(resolve => setTimeout(resolve, this.gracefulShutdownTimeoutMs));
  }

  private async handleLiveness(res: ServerResponse): Promise<void> {
    this.recordActivity('liveness_check');
    
    if (this.isShuttingDown) {
      this.sendResponse(res, 503, {
        status: 'unhealthy',
        message: 'Service is shutting down',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Pod liveness check - only check if the pod process is alive and responsive
    this.sendResponse(res, 200, {
      status: 'alive',
      service: this.serviceName,
      uptime: Math.floor(process.uptime()),
      memory_usage: this.getMemoryUsage(),
      message: 'Pod is alive and responsive. Use /diagnostics/* to check external dependencies.',
      timestamp: new Date().toISOString()
    });
  }

  private async handleReadiness(res: ServerResponse): Promise<void> {
    this.recordActivity('readiness_check');
    
    if (this.isShuttingDown) {
      this.sendResponse(res, 503, {
        status: 'unhealthy',
        message: 'Service is shutting down',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Pod readiness check - only check if the pod itself is ready to serve requests
    // External dependencies are checked via /diagnostics endpoints
    const podChecks = {
      process_running: true,
      memory_available: this.checkMemoryAvailable(),
      uptime: process.uptime(),
      last_activity: this.lastActivity,
      activity_count: this.activityCount
    };

    this.sendResponse(res, 200, {
      status: 'ready',
      service: this.serviceName,
      pod_health: podChecks,
      message: 'Pod is ready to serve requests. Use /diagnostics/* to check external dependencies.',
      timestamp: new Date().toISOString()
    });
  }

  private async handleStartup(res: ServerResponse): Promise<void> {
    this.recordActivity('startup_check');
    
    // For startup probe, we just check if service is not shutting down
    // and has been running for at least a few seconds
    const uptime = Date.now() - this.startTime.getTime();
    const minStartupTime = 5000; // 5 seconds

    if (this.isShuttingDown) {
      this.sendResponse(res, 503, {
        status: 'unhealthy',
        message: 'Service is shutting down',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (uptime < minStartupTime) {
      this.sendResponse(res, 503, {
        status: 'starting',
        message: 'Service is still starting up',
        uptime: uptime,
        timestamp: new Date().toISOString()
      });
      return;
    }

    this.sendResponse(res, 200, {
      status: 'healthy',
      service: this.serviceName,
      uptime: uptime,
      timestamp: new Date().toISOString()
    });
  }

  private async handleDetailedHealth(res: ServerResponse): Promise<void> {
    this.recordActivity('detailed_health_check');
    
    const checkResults = await this.runHealthChecks();
    const allHealthy = checkResults.every(result => result.status === 'healthy');
    const uptime = Date.now() - this.startTime.getTime();

    const healthStatus = {
      status: this.isShuttingDown ? 'shutting_down' : (allHealthy ? 'healthy' : 'unhealthy'),
      service: this.serviceName,
      version: this.version,
      uptime: uptime,
      startTime: this.startTime.toISOString(),
      lastActivity: this.lastActivity.toISOString(),
      activityCount: this.activityCount,
      checks: checkResults,
      timestamp: new Date().toISOString()
    };

    const statusCode = allHealthy && !this.isShuttingDown ? 200 : 503;
    this.sendResponse(res, statusCode, healthStatus);
  }

  private async handleMetrics(res: ServerResponse): Promise<void> {
    if (!this.enableMetrics) {
      this.sendResponse(res, 404, { message: 'Metrics not enabled' });
      return;
    }

    const uptime = Date.now() - this.startTime.getTime();
    
    const metrics = {
      service: this.serviceName,
      version: this.version,
      uptime: uptime,
      startTime: this.startTime.toISOString(),
      lastActivity: this.lastActivity.toISOString(),
      activityCount: this.activityCount,
      isShuttingDown: this.isShuttingDown,
      customMetrics: this.metrics,
      timestamp: new Date().toISOString()
    };

    this.sendResponse(res, 200, metrics);
  }

  private async handleConfig(res: ServerResponse): Promise<void> {
    this.recordActivity('config_dump');
    
    try {
      // Get all configuration using the type-safe CONFIG constant
      const allConfig = ConfigProvider.get(CONFIG.ALL_CONFIG);
      
      // Create a deep copy and mask sensitive values
      const maskedConfig = this.maskSensitiveData(allConfig);
      
      const configResponse = {
        service: this.serviceName,
        version: this.version,
        timestamp: new Date().toISOString(),
        configProvider: {
          initialized: ConfigProvider.isInitialized(),
          configKeys: Object.keys(allConfig || {}).length
        },
        configuration: maskedConfig
      };

      this.sendResponse(res, 200, configResponse);
    } catch (error) {
      this.sendResponse(res, 500, {
        error: 'Failed to retrieve configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Recursively mask sensitive data in configuration objects
   */
  private maskSensitiveData(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSensitiveData(item));
    }

    const masked: any = {};
    
    // Comprehensive list of sensitive patterns
    const sensitivePatterns = [
      // Secrets and passwords
      'password', 'secret', 'token', 'credential', 'pass',
      // API keys and access keys
      'apikey', 'api_key', 'accesskey', 'access_key', 'secretkey', 'secret_key',
      'access_secret', 'access_token', 'refresh_token',
      // Client secrets and private keys
      'clientsecret', 'client_secret', 'privatekey', 'private_key',
      // Auth and authorization
      'auth', 'authorization', 'bearer',
      // Database and connection strings
      'database_url', 'connection_string', 'dsn',
      // AWS and cloud provider specifics
      'access_id', 'secret_access_key', 'session_token',
      // OAuth and client IDs (often sensitive in combination)
      'client_id', 'app_key', 'app_secret',
      // Infrastructure details
      'account', 'account_id', 'tenant_id',
      // Hostnames and endpoints (can reveal infrastructure)
      'host', 'hostname', 'endpoint', 'url'
    ];

    // Additional check for patterns that should always be masked
    const alwaysMaskPatterns = [
      'secret', 'password', 'token', 'key', 'credential'
    ];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains any sensitive pattern
      const isSensitive = sensitivePatterns.some(pattern => 
        lowerKey.includes(pattern)
      );
      
      // Special handling for database URLs - mask the entire URL if it contains credentials
      if (typeof value === 'string' && (lowerKey.includes('database_url') || lowerKey.includes('connection_string'))) {
        // Check if URL contains credentials (username:password@host pattern)
        if (value.includes('@') && (value.includes('://') || value.includes(':'))) {
          masked[key] = '***masked***';
        } else {
          masked[key] = value;
        }
      }
      // Mask sensitive string values
      else if (isSensitive && typeof value === 'string') {
        masked[key] = '***masked***';
      } 
      // Recursively process nested objects
      else if (typeof value === 'object') {
        masked[key] = this.maskSensitiveData(value);
      } 
      // Keep non-sensitive values as-is
      else {
        masked[key] = value;
      }
    }

    return masked;
  }

  private async runHealthChecks(): Promise<Array<{ name: string; status: 'healthy' | 'unhealthy'; message?: string; details?: any }>> {
    const results = [];
    
    for (const check of this.customChecks) {
      try {
        const result = await check.check();
        results.push({
          name: check.name,
          status: result.status,
          message: result.message,
          details: result.details
        });
      } catch (error) {
        results.push({
          name: check.name,
          status: 'unhealthy' as const,
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: error
        });
      }
    }
    
    return results;
  }

  /**
   * Handle force shutdown endpoint for R&D troubleshooting
   */
  private async handleForceShutdown(res: ServerResponse): Promise<void> {
    if (!this.forceShutdownEnabled) {
      this.sendResponse(res, 403, {
        error: 'Force shutdown not enabled',
        message: 'Set HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED=true to enable this endpoint'
      });
      return;
    }

    this.forceShutdownRequested = true;
    console.log('🚨 Force shutdown requested via /health/shutdown endpoint');
    
    this.sendResponse(res, 200, {
      status: 'shutdown_requested',
      message: 'Force shutdown initiated',
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      pid: process.pid
    });

    // Initiate graceful shutdown after response is sent
    setTimeout(() => {
      console.log('💀 Initiating force shutdown...');
      process.exit(0);
    }, 100);
  }

  /**
   * Check if force shutdown has been requested
   */
  public isForceShutdownRequested(): boolean {
    return this.forceShutdownRequested;
  }

  /**
   * Enhanced health check execution with configurable retry logic
   */
  private async executeHealthCheckWithRetries(check: HealthCheck): Promise<{ name: string; status: 'healthy' | 'unhealthy'; message?: string; details?: any }> {
    const checkName = check.name;
    let lastError: Error | null = null;
    
    // If maxRetries is 0, we retry indefinitely (perfect for debugging)
    const maxAttempts = this.maxHealthCheckRetries === 0 ? Number.MAX_SAFE_INTEGER : this.maxHealthCheckRetries + 1;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await check.check();
        
        if (result.status === 'healthy') {
          // Reset failure count on success
          this.consecutiveFailures.set(checkName, 0);
          this.lastSuccessfulCheck.set(checkName, new Date());
          
          if (attempt > 1) {
            console.log(`✅ Health check '${checkName}' recovered after ${attempt - 1} retries`);
          }
          
          return {
            name: checkName,
            status: result.status,
            message: result.message,
            details: { ...result.details, attempts: attempt }
          };
        } else {
          lastError = new Error(result.message || 'Health check failed');
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
      
      // Track consecutive failures
      const currentFailures = this.consecutiveFailures.get(checkName) || 0;
      this.consecutiveFailures.set(checkName, currentFailures + 1);
      
      // Log retry attempt (unless it's infinite retries mode)
      if (this.maxHealthCheckRetries > 0) {
        console.log(`⚠️  Health check '${checkName}' failed (attempt ${attempt}/${this.maxHealthCheckRetries + 1}): ${lastError?.message}`);
      } else {
        console.log(`⚠️  Health check '${checkName}' failed (attempt ${attempt}, infinite retries enabled): ${lastError?.message}`);
      }
      
      // Wait before retry (unless it's the last attempt)
      if (attempt < maxAttempts) {
        console.log(`⏳ Retrying health check '${checkName}' in ${this.healthCheckRetryDelayMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, this.healthCheckRetryDelayMs));
      }
    }
    
    // All retries exhausted (only possible when maxRetries > 0)
    return {
      name: checkName,
      status: 'unhealthy' as const,
      message: `Health check failed after ${this.maxHealthCheckRetries + 1} attempts: ${lastError?.message}`,
      details: { 
        attempts: this.maxHealthCheckRetries + 1,
        lastError: lastError?.message,
        consecutiveFailures: this.consecutiveFailures.get(checkName) || 0
      }
    };
  }

  /**
   * Add a diagnostic check (separate from health checks)
   */
  public addDiagnosticCheck(check: HealthCheck): void {
    this.diagnosticChecks.push(check);
  }

  /**
   * Get current memory usage for pod health checks
   */
  private getMemoryUsage(): { used: string; free: string; total: string } {
    const used = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    
    return {
      used: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
      free: `${Math.round(free / 1024 / 1024)}MB`,
      total: `${Math.round(total / 1024 / 1024)}MB`
    };
  }

  /**
   * Check if sufficient memory is available for pod health
   */
  private checkMemoryAvailable(): boolean {
    try {
      const free = os.freemem();
      const total = os.totalmem();
      const freePercentage = (free / total) * 100;
      
      // Consider memory available if more than 10% free
      return freePercentage > 10;
    } catch (error) {
      // If memory check fails, assume memory is available to avoid health check failures
      console.warn('Memory check failed, assuming memory is available:', error);
      return true;
    }
  }

  /**
   * Handle diagnostics overview endpoint
   */
  private async handleDiagnostics(res: ServerResponse): Promise<void> {
    const diagnostics = {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      available_diagnostics: [
        '/diagnostics/all - Run all diagnostic checks',
        '/diagnostics/database - Check database connectivity',
        '/diagnostics/sqs - Check SQS connectivity'
      ],
      note: 'Diagnostic endpoints show external dependency status without affecting pod health'
    };
    
    this.sendResponse(res, 200, diagnostics);
  }

  /**
   * Handle database diagnostic endpoint
   */
  private async handleDatabaseDiagnostic(res: ServerResponse): Promise<void> {
    const databaseChecks = this.diagnosticChecks.filter(check => 
      check.name.toLowerCase().includes('database') || 
      check.name.toLowerCase().includes('mysql') ||
      check.name.toLowerCase().includes('postgres')
    );

    if (databaseChecks.length === 0) {
      this.sendResponse(res, 200, {
        status: 'no_database_checks',
        message: 'No database diagnostic checks configured',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const results = await Promise.all(
      databaseChecks.map(async (check) => {
        try {
          const result = await check.check();
          return {
            name: check.name,
            status: result.status,
            message: result.message,
            details: result.details,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            name: check.name,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      })
    );

    this.sendResponse(res, 200, {
      diagnostic_type: 'database',
      results,
      summary: {
        total_checks: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        failed: results.filter(r => r.status !== 'healthy').length
      }
    });
  }

  /**
   * Handle SQS diagnostic endpoint
   */
  private async handleSQSDiagnostic(res: ServerResponse): Promise<void> {
    const sqsChecks = this.diagnosticChecks.filter(check => 
      check.name.toLowerCase().includes('sqs') || 
      check.name.toLowerCase().includes('queue')
    );

    if (sqsChecks.length === 0) {
      this.sendResponse(res, 200, {
        status: 'no_sqs_checks',
        message: 'No SQS diagnostic checks configured',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const results = await Promise.all(
      sqsChecks.map(async (check) => {
        try {
          const result = await check.check();
          return {
            name: check.name,
            status: result.status,
            message: result.message,
            details: result.details,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            name: check.name,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      })
    );

    this.sendResponse(res, 200, {
      diagnostic_type: 'sqs',
      results,
      summary: {
        total_checks: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        failed: results.filter(r => r.status !== 'healthy').length
      }
    });
  }

  /**
   * Handle all diagnostics endpoint
   */
  private async handleAllDiagnostics(res: ServerResponse): Promise<void> {
    if (this.diagnosticChecks.length === 0) {
      this.sendResponse(res, 200, {
        status: 'no_diagnostics',
        message: 'No diagnostic checks configured',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const results = await Promise.all(
      this.diagnosticChecks.map(async (check) => {
        try {
          const result = await check.check();
          return {
            name: check.name,
            status: result.status,
            message: result.message,
            details: result.details,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            name: check.name,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      })
    );

    this.sendResponse(res, 200, {
      diagnostic_type: 'all',
      service: this.serviceName,
      results,
      summary: {
        total_checks: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        failed: results.filter(r => r.status !== 'healthy').length
      },
      note: 'These are diagnostic checks for external dependencies. Pod health is separate.'
    });
  }
}
