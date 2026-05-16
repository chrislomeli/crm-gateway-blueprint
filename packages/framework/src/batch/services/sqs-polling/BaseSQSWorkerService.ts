/**
 * BaseSQSWorkerService.ts
 * 
 * Base class for SQS-based worker services that provides common functionality
 * for SQS message processing, including queue polling, message handling,
 * and graceful shutdown.
 */
import { SQSService, type SQSMessage } from '@platform/services';
import { logger } from '@platform/core';
import { ConfigProvider } from '@platform/configuration';

/**
 * Configuration for the BaseSQSWorkerService
 */
export interface BaseSQSWorkerConfig {
  workerId: string;
  sqsQueueUrl: string;
  sqsBatchSize: number;
  sqsVisibilityTimeout: number;
  sqsPollInterval: number;
  gracefulShutdownMs: number;
}

/**
 * Interface for message processors
 * Implementations must provide a processMessage method
 */
export interface MessageProcessor {
  processMessage(message: any): Promise<{ success: boolean; error?: any }>;
  initialize?(): Promise<boolean>;
  shutdown?(): Promise<void>;
}

/**
 * Base class for SQS-based worker services
 * This provides common functionality for SQS message processing
 */
export abstract class BaseSQSWorkerService {
  protected config: BaseSQSWorkerConfig;
  protected isShuttingDown: boolean = false;
  protected isPolling: boolean = false;
  protected pollTimeout: NodeJS.Timeout | null = null;
  protected messageProcessor!: MessageProcessor;

  constructor(config: BaseSQSWorkerConfig) {
    this.config = config;
    
    logger.info({
      workerId: config.workerId,
      config
    }, 'Initializing BaseSQSWorkerService');
  }

  /**
   * Initialize the worker service
   * This will set up the SQS subscriber and start processing messages
   */
  async initialize(): Promise<boolean> {
    try {
      // Create message processor
      this.messageProcessor = await this.createMessageProcessor();

      // Initialize message processor if it has an initialize method
      if (this.messageProcessor.initialize) {
        const initialized = await this.messageProcessor.initialize();
        if (!initialized) {
          logger.error('Failed to initialize message processor');
          return false;
        }
      }

      // Verify queue exists before starting polling
      const queueExists = await this.verifyQueueExists(this.config.sqsQueueUrl);
      
      if (queueExists) {
        // Start polling for messages
        this.startPolling();
        logger.info({ queueUrl: this.config.sqsQueueUrl }, 'SQS polling started');
        return true;
      } else {
        logger.error({ queueUrl: this.config.sqsQueueUrl }, 'SQS queue does not exist, polling not started');
        return false;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize BaseSQSWorkerService');
      return false;
    }
  }

  /**
   * Start polling for messages
   */
  protected startPolling(): void {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    this.pollForMessages();
  }

  /**
   * Stop polling for messages
   */
  protected stopPolling(): void {
    this.isPolling = false;
    
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  /**
   * Poll for messages from SQS
   */
  protected async pollForMessages(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      // Receive messages from SQS
      const result = await SQSService.receiveMessages({
        queueUrl: this.config.sqsQueueUrl,
        maxNumberOfMessages: this.config.sqsBatchSize,
        waitTimeSeconds: 5,
        visibilityTimeout: this.config.sqsVisibilityTimeout
      });

      if (result.success === false) {
        logger.error({ error: result.error }, 'Error receiving messages from SQS');
        return;
      }

      const messages = result.data || [];

      if (messages.length > 0) {
        logger.info({ messageCount: messages.length }, 'Received messages from SQS');
        
        // Process messages in parallel
        await Promise.all(messages.map((message: SQSMessage) => this.handleMessage(message)));
      }
    } catch (error) {
      logger.error({ error }, 'Error polling for messages');
    }

    // Schedule next poll if still polling
    if (this.isPolling && !this.isShuttingDown) {
      this.pollTimeout = setTimeout(() => this.pollForMessages(), this.config.sqsPollInterval);
    }
  }

  /**
   * Handle a single message
   * @param message Message to handle
   */
  protected async handleMessage(message: any): Promise<void> {
    if (!message.ReceiptHandle || !message.MessageId) {
      logger.warn({ message }, 'Invalid message format');
      return;
    }

    try {
      // Process message
      const result = await this.messageProcessor.processMessage(message);
      
      if (result.success) {
        logger.info({ messageId: message.MessageId }, 'Message processed successfully');
        
        // Delete message from queue
        await this.deleteMessage(message.ReceiptHandle);
      } else {
        logger.error({ 
          messageId: message.MessageId, 
          error: result.error 
        }, 'Message processing failed');
        
        // Message will return to the queue after visibility timeout expires
        // unless it's configured to be retryable
        if (result.error && result.error.retryable === false) {
          // If explicitly marked as non-retryable, delete the message
          await this.deleteMessage(message.ReceiptHandle);
          logger.info({ messageId: message.MessageId }, 'Non-retryable failed message deleted from queue');
        }
      }
    } catch (error) {
      logger.error({ 
        messageId: message.MessageId, 
        error 
      }, 'Error handling message');
    }
  }

  /**
   * Delete a message from the queue
   * @param receiptHandle Receipt handle of the message to delete
   */
  protected async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const result = await SQSService.deleteMessage({
        queueUrl: this.config.sqsQueueUrl,
        receiptHandle: receiptHandle
      });

      if (result.success === false) {
        logger.error({ error: result.error, receiptHandle }, 'Error deleting message from queue');
      }
    } catch (error) {
      logger.error({ error, receiptHandle }, 'Error deleting message from queue');
    }
  }

  /**
   * Shutdown the worker service
   * This will stop polling and perform any necessary cleanup
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    logger.info({ workerId: this.config.workerId }, 'Shutting down worker');
    
    // Stop polling
    this.stopPolling();
    
    // Shutdown message processor if it has a shutdown method
    if (this.messageProcessor && this.messageProcessor.shutdown) {
      try {
        await this.messageProcessor.shutdown();
      } catch (error) {
        logger.error({ error }, 'Error shutting down message processor');
      }
    }
    
    // Perform additional cleanup
    await this.performCleanup();
    
    // Wait for graceful shutdown
    setTimeout(() => {
      logger.error({ workerId: this.config.workerId }, 'Forced shutdown after timeout');
      process.exit(1);
    }, this.config.gracefulShutdownMs);
  }

  /**
   * Verify that an SQS queue exists before attempting to subscribe to it
   * @param queueUrl The URL of the queue to verify
   * @returns True if the queue exists, false otherwise
   */
  protected async verifyQueueExists(queueUrl: string): Promise<boolean> {
    try {
      // Try to receive messages with zero wait time and zero messages
      // This will fail if the queue doesn't exist
      const result = await SQSService.receiveMessages({
        queueUrl: queueUrl,
        maxNumberOfMessages: 0,
        waitTimeSeconds: 0
      });

      if (result.success === false) {
        logger.error({ error: result.error, queueUrl }, 'Error verifying SQS queue existence');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, queueUrl }, 'Error verifying SQS queue existence');
      return false;
    }
  }

  /**
   * Create a message processor for the SQS subscriber
   * This should be implemented by derived classes
   */
  protected abstract createMessageProcessor(): Promise<MessageProcessor>;

  /**
   * Perform any additional cleanup when shutting down
   * This can be overridden by derived classes
   */
  protected async performCleanup(): Promise<void> {
    // Default implementation does nothing
  }
}
