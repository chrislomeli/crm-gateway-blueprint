import { HealthCheck } from './types';

/**
 * Database connectivity health check factory
 */
export class DatabaseHealthChecks {
  /**
   * Create a MySQL database connectivity health check
   */
  static createMySQLCheck(
    name: string,
    connectionFactory: () => Promise<any>,
    testQuery: string = 'SELECT 1'
  ): HealthCheck {
    return {
      name: `database_${name}`,
      check: async () => {
        try {
          const connection = await connectionFactory();
          
          // Test the connection with a simple query
          await connection.query(testQuery);
          
          return {
            status: 'healthy',
            message: `Database ${name} is accessible`,
            details: {
              database: name,
              testQuery: testQuery,
              timestamp: new Date().toISOString()
            }
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `Database ${name} connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              database: name,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }

  /**
   * Create a generic database health check
   */
  static createGenericCheck(
    name: string,
    testFunction: () => Promise<void>
  ): HealthCheck {
    return {
      name: `database_${name}`,
      check: async () => {
        try {
          await testFunction();
          
          return {
            status: 'healthy',
            message: `Database ${name} is accessible`,
            details: {
              database: name,
              timestamp: new Date().toISOString()
            }
          };
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `Database ${name} check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              database: name,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }
}
