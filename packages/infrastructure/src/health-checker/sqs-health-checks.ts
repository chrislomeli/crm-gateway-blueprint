import { SQSService } from '@platform/services';
import { HealthCheck } from './types';

/**
 * SQS connectivity health check factory
 * Uses @platform/services for consistent AWS SDK access patterns
 */
export class SQSHealthChecks {
  /**
   * Create an SQS queue connectivity health check using queue URL
   */
  static createQueueCheck(
    name: string,
    queueUrl: string
  ): HealthCheck {
    return {
      name: `sqs_${name}`,
      check: async () => {
        try {
          // Test SQS connectivity by attempting to receive messages (with 0 wait time)
          const result = await SQSService.receiveMessages({
            queueUrl: queueUrl,
            maxNumberOfMessages: 1,
            waitTimeSeconds: 0
          });
          
          if (result.success) {
            return {
              status: 'healthy',
              message: `SQS queue ${name} is accessible`,
              details: {
                queue: name,
                queueUrl: queueUrl,
                timestamp: new Date().toISOString()
              }
            };
          } else {
            return {
              status: 'unhealthy',
              message: `SQS queue ${name} connection failed: ${result.error}`,
              details: {
                queue: name,
                queueUrl: queueUrl,
                error: result.error,
                timestamp: new Date().toISOString()
              }
            };
          }
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `SQS queue ${name} connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              queue: name,
              queueUrl: queueUrl,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }

  /**
   * Create an SQS queue connectivity health check using queue name
   */
  static createQueueNameCheck(
    name: string,
    queueName: string
  ): HealthCheck {
    return {
      name: `sqs_${name}`,
      check: async () => {
        try {
          // First get the queue URL
          const urlResult = await SQSService.getQueueUrl(queueName);
          
          if (!urlResult.success) {
            return {
              status: 'unhealthy',
              message: `SQS queue ${name} not found: ${urlResult.error}`,
              details: {
                queue: name,
                queueName: queueName,
                error: urlResult.error,
                timestamp: new Date().toISOString()
              }
            };
          }

          // Test connectivity by attempting to receive messages
          const result = await SQSService.receiveMessages({
            queueUrl: urlResult.data,
            maxNumberOfMessages: 1,
            waitTimeSeconds: 0
          });
          
          if (result.success) {
            return {
              status: 'healthy',
              message: `SQS queue ${name} is accessible`,
              details: {
                queue: name,
                queueName: queueName,
                queueUrl: urlResult.data,
                timestamp: new Date().toISOString()
              }
            };
          } else {
            return {
              status: 'unhealthy',
              message: `SQS queue ${name} connection failed: ${result.error}`,
              details: {
                queue: name,
                queueName: queueName,
                queueUrl: urlResult.data,
                error: result.error,
                timestamp: new Date().toISOString()
              }
            };
          }
        } catch (error) {
          return {
            status: 'unhealthy',
            message: `SQS queue ${name} connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              queue: name,
              queueName: queueName,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }
          };
        }
      }
    };
  }
}
