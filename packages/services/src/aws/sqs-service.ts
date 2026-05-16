/**
 * SQSService - AWS SQS Integration
 * 
 * This service provides a standardized interface for interacting with AWS SQS.
 * It handles all SQS operations including sending, receiving, and deleting messages.
 * 
 * Key features:
 * - Singleton pattern for SQS client to minimize connection overhead
 * - Environment-aware configuration (works with local development and AWS)
 * - Comprehensive error handling using the Result pattern
 * - Support for batch operations
 * - Built-in logging and observability
 * 
 * This service is used by the SQS subscriber to process messages from SQS queues,
 * but can be used by any component needing SQS access.
 * 
 * @module aws/SQSService
 */

import {
  ChangeMessageVisibilityBatchCommand,
  ChangeMessageVisibilityBatchCommandOutput,
  ChangeMessageVisibilityCommand,
  ChangeMessageVisibilityCommandOutput,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteMessageBatchCommandOutput,
  DeleteMessageCommand,
  DeleteMessageCommandOutput,
  GetQueueUrlCommand,
  Message,
  QueueAttributeName,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageBatchCommandOutput,
  SendMessageCommand,
  SendMessageCommandOutput,
  SQSClient
} from '@aws-sdk/client-sqs';

// STS imports removed - validation disabled to avoid permission requirements in EKS
import {failureFromError, getErrorInfo, logger, Result, success} from '@platform/core';
import {AwsClientFactory} from './aws-client-factory';


// Export proxy type to avoid direct AWS SDK dependency in consuming code
export type SQSMessage = Message;

export interface SQSReceiveOptions {
  queueUrl: string;
  maxNumberOfMessages?: number;
  visibilityTimeout?: number;
  waitTimeSeconds?: number;
  attributeNames?: QueueAttributeName[];
  messageAttributeNames?: string[];
}

export interface SQSDeleteOptions {
  queueUrl: string;
  receiptHandle: string;
}

export interface SQSDeleteBatchOptions {
  queueUrl: string;
  entries: {
    Id: string;
    ReceiptHandle: string;
  }[];
}

export interface SQSSendOptions {
  queueUrl: string;
  messageBody: string;
  delaySeconds?: number;
  messageAttributes?: Record<string, any>;
  messageDeduplicationId?: string;
  messageGroupId?: string;
}

export interface SQSSendBatchOptions {
  queueUrl: string;
  entries: {
    Id: string;
    MessageBody: string;
    DelaySeconds?: number;
    MessageAttributes?: Record<string, any>;
    MessageDeduplicationId?: string;
    MessageGroupId?: string;
  }[];
}

export interface SQSChangeVisibilityOptions {
  queueUrl: string;
  receiptHandle: string;
  visibilityTimeout: number;
}

export interface SQSChangeVisibilityBatchOptions {
  queueUrl: string;
  entries: {
    Id: string;
    ReceiptHandle: string;
    VisibilityTimeout: number;
  }[];
}

export class SQSService {
  private static client: SQSClient;

  /**
   * Get the SQS client instance (creates one if it doesn't exist)
   * @returns SQS client
   */
  static getSQSClient(): SQSClient {
    if (!SQSService.client) {
      SQSService.client = SQSService.createSQSClient();
    }
    return SQSService.client;
  }

  private static createSQSClient(): SQSClient {
    logger.info('SQSService: Creating client');
    return AwsClientFactory.createSQSClient();
  }
  
  /**
   * Receive messages from an SQS queue
   * @param options Options for receiving messages
   * @returns Result containing the received messages or an error
   */
  static async receiveMessages(options: SQSReceiveOptions): Promise<Result<SQSMessage[]>> {
    try {
      logger.debug({ queueUrl: options.queueUrl }, 'Receiving messages from SQS');
      
      const client = SQSService.getSQSClient();
      const command = new ReceiveMessageCommand({
        QueueUrl: options.queueUrl,
        MaxNumberOfMessages: options.maxNumberOfMessages || 10,
        VisibilityTimeout: options.visibilityTimeout || 30,
        WaitTimeSeconds: options.waitTimeSeconds || 0,
        AttributeNames: options.attributeNames || [],
        MessageAttributeNames: options.messageAttributeNames || []
      });
      
      const response = await client.send(command);
      const messages = response.Messages || [];
      
      logger.debug({ 
        queueUrl: options.queueUrl, 
        messageCount: messages.length 
      }, 'Received messages from SQS');

      return success(messages);
    } catch (error) {
      const errorInfo = getErrorInfo(error);
      logger.error({ 
        message: errorInfo.message,
        statusCode: errorInfo.statusCode,
        code: errorInfo.code,
        queueUrl: options.queueUrl,
        maxMessages: options.maxNumberOfMessages,
        visibilityTimeout: options.visibilityTimeout,
        waitTimeSeconds: options.waitTimeSeconds,
        stack: (error as Error)?.stack
      }, 'Failed to receive messages from SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Delete a message from an SQS queue
   * @param options Options for deleting a message
   * @returns Result containing the response or an error
   */
  static async deleteMessage(options: SQSDeleteOptions): Promise<Result<DeleteMessageCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl, receiptHandle: options.receiptHandle }, 'Deleting message from SQS');
      
      const client = SQSService.getSQSClient();
      const command = new DeleteMessageCommand({
        QueueUrl: options.queueUrl,
        ReceiptHandle: options.receiptHandle
      });
      
      const response = await client.send(command);
      logger.debug({ queueUrl: options.queueUrl }, 'Deleted message from SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to delete message from SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Delete multiple messages from an SQS queue in a batch
   * @param options Options for batch deleting messages
   * @returns Result containing the response or an error
   */
  static async deleteMessageBatch(options: SQSDeleteBatchOptions): Promise<Result<DeleteMessageBatchCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl, count: options.entries.length }, 'Batch deleting messages from SQS');
      
      const client = SQSService.getSQSClient();
      const command = new DeleteMessageBatchCommand({
        QueueUrl: options.queueUrl,
        Entries: options.entries
      });
      
      const response = await client.send(command);
      logger.debug({ queueUrl: options.queueUrl, count: options.entries.length }, 'Batch deleted messages from SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to batch delete messages from SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Send a message to an SQS queue
   * @param options Options for sending a message
   * @returns Result containing the response or an error
   */
  static async sendMessage(options: SQSSendOptions): Promise<Result<SendMessageCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl }, 'Sending message to SQS');
      
      const client = SQSService.getSQSClient();
      const command = new SendMessageCommand({
        QueueUrl: options.queueUrl,
        MessageBody: options.messageBody,
        DelaySeconds: options.delaySeconds,
        MessageAttributes: options.messageAttributes,
        MessageDeduplicationId: options.messageDeduplicationId,
        MessageGroupId: options.messageGroupId
      });
      
      const response = await client.send(command);
      logger.debug({ queueUrl: options.queueUrl, messageId: response.MessageId }, 'Sent message to SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to send message to SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Send multiple messages to an SQS queue in a batch
   * @param options Options for batch sending messages
   * @returns Result containing the response or an error
   */
  static async sendMessageBatch(options: SQSSendBatchOptions): Promise<Result<SendMessageBatchCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl, count: options.entries.length }, 'Batch sending messages to SQS');
      
      const client = SQSService.getSQSClient();
      const command = new SendMessageBatchCommand({
        QueueUrl: options.queueUrl,
        Entries: options.entries
      });
      
      const response = await client.send(command);
      logger.debug({ 
        queueUrl: options.queueUrl, 
        successful: response.Successful?.length || 0,
        failed: response.Failed?.length || 0
      }, 'Batch sent messages to SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to batch send messages to SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Change the visibility timeout of a message in an SQS queue
   * @param options Options for changing message visibility
   * @returns Result containing the response or an error
   */
  static async changeMessageVisibility(options: SQSChangeVisibilityOptions): Promise<Result<ChangeMessageVisibilityCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl, receiptHandle: options.receiptHandle }, 'Changing message visibility in SQS');
      
      const client = SQSService.getSQSClient();
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: options.queueUrl,
        ReceiptHandle: options.receiptHandle,
        VisibilityTimeout: options.visibilityTimeout
      });
      
      const response = await client.send(command);
      logger.debug({ queueUrl: options.queueUrl }, 'Changed message visibility in SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to change message visibility in SQS');
      return failureFromError(error as Error);
    }
  }
  
  /**
   * Change the visibility timeout of multiple messages in an SQS queue
   * @param options Options for changing message visibility
   * @returns Result containing the response or an error
   */
  static async changeMessageVisibilityBatch(options: SQSChangeVisibilityBatchOptions): Promise<Result<ChangeMessageVisibilityBatchCommandOutput>> {
    try {
      logger.debug({ queueUrl: options.queueUrl, count: options.entries.length }, 'Batch changing message visibility in SQS');
      
      const client = SQSService.getSQSClient();
      const command = new ChangeMessageVisibilityBatchCommand({
        QueueUrl: options.queueUrl,
        Entries: options.entries
      });
      
      const response = await client.send(command);
      logger.debug({ queueUrl: options.queueUrl, count: options.entries.length }, 'Batch changed message visibility in SQS');

      return success(response);
    } catch (error) {
      logger.error({ error, queueUrl: options.queueUrl }, 'Failed to batch change message visibility in SQS');
      return failureFromError(error as Error);
    }
  }

  /**
   * Get the URL of an SQS queue by its name
   * @param queueName The name of the SQS queue
   * @returns Result containing the queue URL or an error
   */
  static async getQueueUrl(queueName: string): Promise<Result<string>> {
    try {
      logger.info({ queueName }, '🔍 SQSService: Getting queue URL from SQS');
      
      const client = SQSService.getSQSClient();
      
      // Debug: Log the client configuration
      // logger.info({
      //   clientConfig: (client as any).config,
      //   region: (client as any).config?.region,
      //   endpoint: (client as any).config?.endpoint,
      //   credentials: (client as any).config?.credentials
      // }, '🔧 SQS Client configuration details');
      
      // STS validation disabled to avoid permission requirements in EKS
      
      logger.info({ queueName }, '📨 Sending GetQueueUrlCommand to SQS...');
      const command = new GetQueueUrlCommand({
        QueueName: queueName
      });
      const response = await client.send(command);
      const queueUrl = response.QueueUrl;
      
      logger.info({ queueName, queueUrl }, '✅ Successfully got queue URL from SQS');

      return success(queueUrl || '');
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error as any).$metadata && { metadata: (error as any).$metadata }
        } : error,
        queueName 
      }, '❌ Failed to get queue URL from SQS');
      return failureFromError(error as Error);
    }
  }

  /**
   * Republish events as individual messages (fire-and-forget)
   * Used for retrying failed events from batch processing without duplicating successful ones
   * @param queueUrl The SQS queue URL to republish to
   * @param events Array of events to republish as individual messages
   * @param delaySeconds Optional delay before messages become available (default: 0)
   * @returns Result indicating if republish was initiated successfully
   */
  static async republishEvents(queueUrl: string, events: any[], delaySeconds = 0): Promise<Result<void>> {
    try {
      if (!events || events.length === 0) {
        logger.info('No events to republish');
        return success(undefined);
      }

      logger.info({
        queueUrl,
        eventCount: events.length,
        delaySeconds
      }, 'Republishing events as individual messages');

      // Send each event as individual message (fire and forget)
      const promises = events.map((event, index) => 
        SQSService.sendMessage({
          queueUrl,
          messageBody: JSON.stringify(event),
          delaySeconds
        }).catch(error => {
          logger.error({
            error,
            eventIndex: index,
            queueUrl
          }, 'Failed to republish individual event');
          return error; // Don't throw, just log and continue
        })
      );
      
      // Fire and forget - don't await completion
      Promise.all(promises).then(results => {
        const failures = results.filter(result => result instanceof Error);
        if (failures.length > 0) {
          logger.error({
            queueUrl,
            totalEvents: events.length,
            failedCount: failures.length
          }, 'Some events failed to republish');
        } else {
          logger.info({
            queueUrl,
            eventCount: events.length
          }, 'All events republished successfully');
        }
      }).catch(error => {
        logger.error({
          error,
          queueUrl,
          eventCount: events.length
        }, 'Unexpected error in republish fire-and-forget');
      });
      
      return success(undefined);
    } catch (error) {
      logger.error({
        error,
        queueUrl,
        eventCount: events?.length || 0
      }, 'Failed to initiate event republishing');
      return failureFromError(error as Error);
    }
  }

  /**
   * Create an SQS queue - idempotent operation
   * @param queueName Name of the queue to create
   * @param attributes Optional queue attributes
   * @returns Result containing the queue URL or an error
   */
  static async createQueue(
    queueName: string, 
    attributes?: Record<string, string>
  ): Promise<Result<string>> {
    try {
      logger.info({ queueName, attributes }, 'Creating SQS queue');
      
      const command = new CreateQueueCommand({
        QueueName: queueName,
        Attributes: attributes || {
          // Minimal attributes for LocalStack compatibility
          'MessageRetentionPeriod': '1209600' // 14 days
        }
      });

      const result = await SQSService.getSQSClient().send(command);
      
      if (result.QueueUrl) {
        logger.info({ queueName, queueUrl: result.QueueUrl }, 'SQS queue created successfully');
        return success(result.QueueUrl);
      } else {
        const error = new Error('Queue creation returned no URL');
        logger.error({ queueName, error }, 'Failed to create SQS queue');
        return failureFromError(error);
      }
    } catch (error) {
      const errorInfo = getErrorInfo(error as Error);
      logger.error({ queueName, error: errorInfo }, 'Failed to create SQS queue');
      return failureFromError(error as Error);
    }
  }
}
