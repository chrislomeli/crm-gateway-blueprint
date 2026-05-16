/**
 * Health Check Integration Example
 * 
 * Shows how to surgically integrate the existing health-checker system
 * into services like simple-publisher with minimal code changes.
 */

import http from 'http';
import { URL } from 'url';
import { ConfigProvider, CONFIG } from '@platform/configuration';
import { MySQLService, ElasticsearchFacade } from '@platform/connectors';
import { 
  HealthChecker, 
  DatabaseHealthChecks, 
  SQSHealthChecks, 
  ElasticsearchHealthChecks 
} from '@platform/infrastructure';

/**
 * Example: Adding health checks to simple-publisher service
 */
async function setupHealthChecks(): Promise<HealthChecker> {
  // Get configuration for health checks
  const hubspotConfig = ConfigProvider.get(CONFIG.HUBSPOT_CONFIG_LEGACY);
  
  // Create health checker with custom checks
  const healthChecker = new HealthChecker({
    serviceName: 'simple-publisher',
    version: '1.0.0',
    customChecks: [
      // Database connectivity check
      DatabaseHealthChecks.createMySQLCheck(
        'calls-db',
        async () => MySQLService.CRM,
        'SELECT 1 as health_check'
      ),
      
      // SQS queue resolution checks
      SQSHealthChecks.createQueueNameCheck(
        'hubspot-single-queue',
        hubspotConfig.singleQueueName
      ),
      SQSHealthChecks.createQueueNameCheck(
        'hubspot-import-queue', 
        hubspotConfig.importQueueName
      ),
      SQSHealthChecks.createQueueNameCheck(
        'hubspot-intent-queue',
        hubspotConfig.intentQueueName
      ),
      
      // Elasticsearch connectivity check (using ElasticsearchFacade)
      {
        name: 'elasticsearch_cluster',
        check: async () => {
          try {
            // Test Elasticsearch connectivity using the facade
            // We'll use a simple search to test connectivity
            const testResult = await ElasticsearchFacade.searchContacts(
              '1', // test business ID
              1,   // test CRM ID
              { match_all: {} },
              { size: 0 } // Just check connectivity, don't return results
            );
            
            return {
              status: testResult.success ? 'healthy' : 'unhealthy',
              message: testResult.success 
                ? 'Elasticsearch cluster is accessible via facade'
                : `Elasticsearch connectivity issue: ${testResult.error}`,
              details: {
                cluster: 'search-cluster',
                facade_available: true,
                test_query_success: testResult.success,
                timestamp: new Date().toISOString()
              }
            };
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
      },
      
      // Custom config dump check
      {
        name: 'config_dump',
        check: async () => {
          try {
            const config = {
              localstack: ConfigProvider.get(CONFIG.SHARED_LOCALSTACK),
              sqs: ConfigProvider.get(CONFIG.HUBSPOT_CONFIG_LEGACY),
              elasticsearch: ConfigProvider.get(CONFIG.ELASTICSEARCH_LEGACY),
              // Mask sensitive values
              hubspot: {
                ...ConfigProvider.get(CONFIG.HUBSPOT_LEGACY),
                apiKey: '***masked***'
              }
            };
            
            return {
              status: 'healthy',
              message: 'Configuration loaded successfully',
              details: {
                config_keys: Object.keys(config).length,
                resolved_config: config
              }
            };
          } catch (error) {
            return {
              status: 'unhealthy',
              message: 'Configuration resolution failed',
              details: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
          }
        }
      }
    ]
  });
  
  return healthChecker;
}

/**
 * Example: Standalone health check server (recommended approach)
 */
async function runStandaloneHealthServer() {
  const healthChecker = await setupHealthChecks();
  
  // Start health check server on separate port
  await healthChecker.startServer(8080);
  
  console.log('Health check server running on port 8080');
  console.log('Health endpoints available:');
  console.log('  GET /health         - Complete health status');
  console.log('  GET /health/ready   - Kubernetes readiness probe');
  console.log('  GET /health/live    - Kubernetes liveness probe');
  console.log('  GET /health/startup - Kubernetes startup probe');
  console.log('  GET /metrics        - Prometheus-style metrics');
}

/**
 * Example: Manual health check integration (if you need custom integration)
 */
async function integrateHealthChecksManually() {
  const healthChecker = await setupHealthChecks();
  
  // Create HTTP server with manual health check handling
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    
    // MANUAL HEALTH CHECK HANDLING: Replicate HealthChecker logic
    if (url.pathname.startsWith('/health')) {
      try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', 'application/json');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }
        
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        
        // Route to appropriate health check
        switch (url.pathname) {
          case '/health':
          case '/health/detailed':
            // Run all health checks manually
            const checkResults = [];
            for (const check of healthChecker.customChecks || []) {
              try {
                const result = await check.check();
                checkResults.push({ name: check.name, ...result });
              } catch (error) {
                checkResults.push({
                  name: check.name,
                  status: 'unhealthy',
                  message: error instanceof Error ? error.message : 'Unknown error'
                });
              }
            }
            
            const allHealthy = checkResults.every(r => r.status === 'healthy');
            res.writeHead(allHealthy ? 200 : 503);
            res.end(JSON.stringify({
              status: allHealthy ? 'healthy' : 'unhealthy',
              service: 'simple-publisher',
              checks: checkResults,
              timestamp: new Date().toISOString()
            }, null, 2));
            break;
            
          case '/health/ready':
            res.writeHead(200);
            res.end(JSON.stringify({
              status: 'healthy',
              message: 'Service is ready',
              timestamp: new Date().toISOString()
            }));
            break;
            
          case '/health/live':
            res.writeHead(200);
            res.end(JSON.stringify({
              status: 'healthy',
              message: 'Service is alive',
              timestamp: new Date().toISOString()
            }));
            break;
            
          default:
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Health endpoint not found' }));
        }
        return;
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({
          error: 'Health check failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        }));
        return;
      }
    }
    
    // ... existing request handling logic continues unchanged ...
    
    // Example: existing webhook handling
    if (url.pathname === '/webhook' && req.method === 'POST') {
      // ... existing webhook logic ...
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // 404 for unhandled routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  server.listen(3000, () => {
    console.log('Server running on port 3000 with integrated health checks');
    console.log('Health endpoints available:');
    console.log('  GET /health         - Complete health status');
    console.log('  GET /health/ready   - Kubernetes readiness probe');
    console.log('  GET /health/live    - Kubernetes liveness probe');
  });
}

/**
 * Available Health Endpoints (automatically provided by HealthChecker):
 * 
 * GET /health/detailed - Complete health status with all checks
 * GET /health/ready    - Kubernetes readiness probe (quick check)
 * GET /health/live     - Kubernetes liveness probe (lightweight)
 * GET /health/startup  - Kubernetes startup probe (initialization check)
 * GET /health          - Alias for /health/detailed
 * GET /metrics         - Prometheus-style metrics (if enabled)
 */

export { setupHealthChecks, runStandaloneHealthServer, integrateHealthChecksManually };
