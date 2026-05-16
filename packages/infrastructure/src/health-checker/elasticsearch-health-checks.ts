import { HealthCheck } from './types';

/**
 * Elasticsearch connectivity health check factory
 */
export class ElasticsearchHealthChecks {
  /**
   * Create an Elasticsearch cluster health check
   */
  static createClusterCheck(
    name: string,
    esClient: any
  ): HealthCheck {
    return {
      name: `elasticsearch_${name}`,
      check: async () => {
        try {
          // Test Elasticsearch connectivity by checking cluster health
          const response = await esClient.cluster.health();
          
          return {
            status: response.body.status === 'red' ? 'unhealthy' : 'healthy',
            message: `Elasticsearch cluster ${name} status: ${response.body.status}`,
            details: {
              cluster: name,
              clusterStatus: response.body.status,
              numberOfNodes: response.body.number_of_nodes,
              numberOfDataNodes: response.body.number_of_data_nodes,
              timestamp: new Date().toISOString()
            }
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `Elasticsearch cluster ${name} connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              cluster: name,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }

  /**
   * Create a simple Elasticsearch ping health check
   */
  static createPingCheck(
    name: string,
    esClient: any
  ): HealthCheck {
    return {
      name: `elasticsearch_ping_${name}`,
      check: async () => {
        try {
          // Simple ping to test connectivity
          await esClient.ping();
          
          return {
            status: 'healthy',
            message: `Elasticsearch ${name} is accessible`,
            details: {
              service: name,
              timestamp: new Date().toISOString()
            }
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `Elasticsearch ${name} ping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              service: name,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }

  /**
   * Create an HTTP-based Elasticsearch health check (for external ES services)
   */
  static createHttpCheck(
    name: string,
    esHost: string
  ): HealthCheck {
    return {
      name: `elasticsearch_http_${name}`,
      check: async () => {
        try {
          // Use fetch or http client to check ES health endpoint
          const response = await fetch(`${esHost}/_cluster/health`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const healthData = await response.json();
          
          return {
            status: healthData.status === 'red' ? 'unhealthy' : 'healthy',
            message: `Elasticsearch ${name} HTTP health check: ${healthData.status}`,
            details: {
              service: name,
              host: esHost,
              clusterStatus: healthData.status,
              numberOfNodes: healthData.number_of_nodes,
              timestamp: new Date().toISOString()
            }
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `Elasticsearch ${name} HTTP check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              service: name,
              host: esHost,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }
}
