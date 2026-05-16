/**
 * BaseSubscriber.ts
 * 
 * Core implementation of the SQS subscriber that handles polling, message processing,
 * and queue management.
 */
import { Message } from '@aws-sdk/client-sqs';
import {
  Subscriber,
  SubscriberConfig,
  MessageProcessor,
  StatusStore,
  MessageStatus,
  WorkerResult,
  SubscriberMetrics,
  QueueStatus, MessageContext
} from '../interfaces';
import {getErrorInfo, logger} from '@platform/core';
import { isSuccess } from '@platform/core';
import {InMemoryStatusStore} from "./MemoryStore";
import {SQSReceiveOptions, SQSService} from "../../sqs-service";


/**
 * Base SQS Subscriber implementation
 */
export class BaseSubscriber<T = any> implements Subscriber<T> {
  private config: SubscriberConfig;
  private processor: MessageProcessor<T>;
  private statusStore: StatusStore;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private errorHandlers: Array<(error: Error) => void> = [];
  private statusHandlers: Array<(messageId: string, status: MessageStatus) => void> = [];
  private messageReceivedHandlers: Array<(messageId: string) => void> = [];
  private messageProcessedHandlers: Array<(messageId: string, result: WorkerResult) => void> = [];
  private queueUrl: string | null = null; // Cache for resolved queue URL

  private metrics: SubscriberMetrics = {
    processedCount: 0,
    failedCount: 0,
    timeoutCount: 0,
    averageProcessingTime: 0,
    batchesProcessed: 0,
    successRate: 100,
    inFlightCount: 0,
    processingTimes: []
  };
  private processingStartTimes: Map<string, number> = new Map();

  constructor(
    processor: MessageProcessor<T>,
    config: SubscriberConfig,
    statusStore?: StatusStore
  ) {
    logger.debug({ config }, '📥 Initializing BaseSubscriber');


    // Set configuration with defaults
    this.config = {
      ...config,
      waitTimeSeconds: config.waitTimeSeconds || 20,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 30,
      maxEmptyCycles: config.maxEmptyCycles || 3
    };
    
    // Initialize status store
    this.statusStore = statusStore || new InMemoryStatusStore();
    
    // Set message processor
    this.processor = processor;
    
    // Queue URL will be resolved on first use
    this.queueUrl = null;
    
    // Log initialization
    logger.info({ 
      queueName: this.config.queueName,
      batchSize: this.config.batchSize,
      visibilityTimeout: this.config.visibilityTimeout,
      oneShotMode: this.config.oneShotMode
    }, 'SQS Subscriber initialized');
  }

  /**
   * Ensure queue URL is resolved, resolving it if necessary
   * @returns Promise<string> The resolved queue URL
   */
  private async ensureQueueUrl(): Promise<string> {
    if (this.queueUrl) {
      return this.queueUrl;
    }

    if (!this.config?.queueName) {
      throw new Error('Queue name is required');
    }


    // Check if queueName is already a full URL
    if (this.config.queueName.startsWith('http://') || this.config.queueName.startsWith('https://')) {
      this.queueUrl = this.config.queueName;
      logger.debug({ queueUrl: this.queueUrl }, 'Using provided queue URL');
      return this.queueUrl;
    }

    // Resolve queue name to URL using SQS service
    logger.debug({ queueName: this.config.queueName }, 'Resolving queue name to URL');
    const result = await SQSService.getQueueUrl(this.config.queueName);
    
    if (!isSuccess(result)) {
      throw new Error(`Failed to resolve queue URL for queue: ${this.config.queueName}. Error: ${result.error.message}`);
    }

    this.queueUrl = result.data;
    logger.info({ queueName: this.config.queueName, queueUrl: this.queueUrl }, 'Queue URL resolved');
    return this.queueUrl;
  }

  /**
   * Set message processor
   * @param processor Message processor to use
   */
  setMessageProcessor(processor: MessageProcessor<T>): void {
    this.processor = processor;
    logger.info({}, 'Message processor updated');
  }

  /**
   * Start the subscriber
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info({}, 'Subscriber is already running');
      return;
    }

    logger.info({}, 'Starting SQS subscriber...');
    this.isRunning = true;
    this.isPaused = false;
    
    // Start polling
    await this.poll();
    
    logger.info({}, 'SQS subscriber started successfully');
  }

  /**
   * Stop the subscriber
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info({}, 'Subscriber is not running');
      return;
    }

    logger.info({}, 'Stopping SQS subscriber...');
    this.isRunning = false;
    
    // Clear polling timeout
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    
    logger.info({}, 'SQS subscriber stopped successfully');
  }

  /**
   * Pause the subscriber
   */
  async pause(): Promise<void> {
    if (!this.isRunning) {
      logger.info({}, 'Cannot pause: subscriber is not running');
      return;
    }

    if (this.isPaused) {
      logger.info({}, 'Subscriber is already paused');
      return;
    }

    logger.info({}, 'Pausing SQS subscriber...');
    this.isPaused = true;
    logger.info({}, 'SQS subscriber paused successfully');
  }

  /**
   * Resume the subscriber
   */
  async resume(): Promise<void> {
    if (!this.isRunning) {
      logger.info({}, 'Cannot resume: subscriber is not running');
      return;
    }

    if (!this.isPaused) {
      logger.info({}, 'Subscriber is not paused');
      return;
    }

    logger.info({}, 'Resuming SQS subscriber...');
    this.isPaused = false;
    logger.info({}, 'SQS subscriber resumed successfully');
  }

  /**
   * Register an error handler
   * @param handler Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register a status change handler
   * @param handler Status change handler function
   */
  onStatusChange(handler: (messageId: string, status: MessageStatus) => void): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Register a message received handler
   * @param handler Message received handler function
   */
  onMessageReceived(handler: (messageId: string) => void): void {
    this.messageReceivedHandlers.push(handler);
  }

  /**
   * Register a message processed handler
   * @param handler Message processed handler function
   */
  onMessageProcessed(handler: (messageId: string, result: WorkerResult) => void): void {
    this.messageProcessedHandlers.push(handler);
  }

  /**
   * Update subscriber configuration at runtime
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<SubscriberConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ updatedConfig: this.config }, 'Subscriber configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): SubscriberConfig {
    return { ...this.config };
  }

  /**
   * Get current queue status (depth, etc)
   */
  async getQueueStatus(): Promise<QueueStatus> {
    // This is a simplified implementation
    return {
      approximateNumberOfMessages: 0,
      approximateNumberOfMessagesNotVisible: 0,
      approximateNumberOfMessagesDelayed: 0,
      lastCheckedTimestamp: new Date()
    };
  }

  /**
   * Reprocess a failed message from DLQ
   * @param messageId Message ID to reprocess
   */
  async reprocessFromDLQ(messageId: string): Promise<void> {
    logger.info({ messageId }, 'Reprocessing message from DLQ not implemented');
    throw new Error('Reprocessing from DLQ not implemented');
  }

  /**
   * Move a message to DLQ without processing
   * @param messageId Message ID to move
   * @param reason Reason for moving to DLQ
   */
  async moveToDeadLetter(messageId: string, reason: string): Promise<void> {
    logger.info({ messageId, reason }, 'Moving message to DLQ not implemented');
    throw new Error('Moving to DLQ not implemented');
  }

  /**
   * Purge all messages from the queue
   */
  async purgeQueue(): Promise<void> {
    logger.info({ queueUrl: await this.ensureQueueUrl() }, 'Purging queue not implemented');
    throw new Error('Purging queue not implemented');
  }

  /**
   * Main polling method
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;
    if (this.isPaused) {
      this.pollTimeout = setTimeout(() => this.poll(), this.config.pollInterval);
      return;
    }

    try {
      const awaitQueue = await this.ensureQueueUrl();
      logger.debug({ queueUrl: awaitQueue }, 'Polling SQS queue');

      const request: SQSReceiveOptions = {
        queueUrl: await this.ensureQueueUrl(),
        maxNumberOfMessages: this.config.batchSize,
        visibilityTimeout: this.config.visibilityTimeout,
        waitTimeSeconds: this.config.waitTimeSeconds || 20,
        attributeNames: ['All'],
        messageAttributeNames: ['All']
      }

      const result = await SQSService.receiveMessages(request);
      
      if (!isSuccess(result)) {
        throw result.error;
      }
      
      const messages = result.data as Message[];
      
      if (messages.length > 0) {
        logger.info({ messageCount: messages.length }, 'Received messages from SQS');

        await this.processMessages(messages);
      } else {
        logger.debug({}, 'No messages received from SQS');
      }
    } catch (error) {
      logger.error(getErrorInfo(error), 'Error polling SQS queue');
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
    }

    // Schedule next poll
    this.pollTimeout = setTimeout(() => this.poll(), this.config.pollInterval);
  }

  /**
   * Process a batch of messages
   * @param messages Messages to process
   */
  private async processMessages(messages: Message[]): Promise<void> {
    this.metrics.batchesProcessed++;
    
    // Process messages in parallel
    await Promise.all(messages.map(message => this.processMessage(message)));
  }

  /**
   * Process a single message
   * @param message Message to process
   */
  private async processMessage(message: Message): Promise<void> {
    if (!message.MessageId) {
      logger.warn({}, 'Received message without MessageId');
      return;
    }

    logger.debug({ message }, '✅ Processing message');

    const messageId = message.MessageId;
    
    try {
      // Notify message received
      this.notifyMessageReceived(messageId);
      
      // Update status
      await this.statusStore.setStatus(messageId, 'processing');
      this.notifyStatusChange(messageId, 'processing');
      
      // Track processing start time
      const startTime = Date.now();
      this.processingStartTimes.set(messageId, startTime);
      this.metrics.inFlightCount++;
      
      // Parse message body
      let body: T;
      try {
        body = message.Body ? JSON.parse(message.Body) : {} as T;
      } catch (error) {
        logger.warn(getErrorInfo(error), 'Failed to parse message body as JSON');
        body = (message.Body || {}) as T;
      }
      
      // Process message
      const result = await this.processor.process({
        messageId,
        body,
        raw: message
      } as MessageContext<T>);
      
      // Track processing time
      const processingTime = Date.now() - startTime;
      this.metrics.processingTimes.push(processingTime);
      
      // Keep only the last 100 processing times
      if (this.metrics.processingTimes.length > 100) {
        this.metrics.processingTimes.shift();
      }
      
      // Update average processing time
      const totalTime = this.metrics.processingTimes.reduce((sum, time) => sum + time, 0);
      this.metrics.averageProcessingTime = totalTime / this.metrics.processingTimes.length;
      
      // Update metrics
      this.metrics.processedCount++;
      this.metrics.successRate = (this.metrics.processedCount / (this.metrics.processedCount + this.metrics.failedCount)) * 100;
      this.processingStartTimes.delete(messageId);
      this.metrics.inFlightCount--;
      
      // Notify message processed
      this.notifyMessageProcessed(messageId, result);
      
      if (result.success) {
        // Update status
        await this.statusStore.setStatus(messageId, 'completed');
        this.notifyStatusChange(messageId, 'completed');
        
        // Delete message from queue
        await this.deleteMessage(message);
      } else {
        // Update status
        await this.statusStore.setStatus(messageId, 'failed');
        this.notifyStatusChange(messageId, 'failed');
        
        // If error is retryable, don't delete the message
        // It will become visible again after the visibility timeout
        if (!result.retryable) {
          await this.deleteMessage(message);
        }
      }
      
    } catch (error) {
      logger.error({ error, messageId }, 'Error processing message');
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      
      // Update status
      await this.statusStore.setStatus(messageId, 'failed');
      this.notifyStatusChange(messageId, 'failed');
      
      // Update metrics
      this.metrics.failedCount++;
      this.processingStartTimes.delete(messageId);
      this.metrics.inFlightCount--;
    }
  }

  /**
   * Delete a message from the queue
   * @param message Message to delete
   */
  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      logger.warn({ messageId: message.MessageId }, 'Cannot delete message without ReceiptHandle');
      return;
    }

    try {
      const result = await SQSService.deleteMessage({
        queueUrl: await this.ensureQueueUrl(),
        receiptHandle: message.ReceiptHandle
      });
      
      if (isSuccess(result)) {
        logger.debug({ messageId: message.MessageId }, 'Deleted message from queue');
      } else {
        throw result.error;
      }
    } catch (error) {
      logger.error({ error, messageId: message.MessageId }, 'Error deleting message from queue');
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Notify error handlers
   * @param error Error to notify
   */
  private notifyError(error: Error): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (handlerError) {
        logger.error({ handlerError }, 'Error in error handler');
      }
    });
  }

  /**
   * Notify status change handlers
   * @param messageId Message ID
   * @param status New status
   */
  private notifyStatusChange(messageId: string, status: MessageStatus): void {
    this.statusHandlers.forEach(handler => {
      try {
        handler(messageId, status);
      } catch (error) {
        logger.error(getErrorInfo(error), 'Error in status change handler');
      }
    });
  }

  /**
   * Notify message received handlers
   * @param messageId Message ID
   */
  private notifyMessageReceived(messageId: string): void {
    this.messageReceivedHandlers.forEach(handler => {
      try {
        handler(messageId);
      } catch (error) {
        logger.error(getErrorInfo(error), 'Error in message received handler');
      }
    });
  }

  /**
   * Notify message processed handlers
   * @param messageId Message ID
   * @param result Processing result
   */
  private notifyMessageProcessed(messageId: string, result: WorkerResult): void {
    this.messageProcessedHandlers.forEach(handler => {
      try {
        handler(messageId, result);
      } catch (error) {
        logger.error(getErrorInfo(error), 'Error in message processed handler');
      }
    });
  }

  /**
   * Run in one-shot mode (process all available messages and exit)
   * @returns Number of messages processed
   */
  async runOneShot(): Promise<number> {
    logger.info({
      queueName: this.config.queueName,
      maxEmptyCycles: this.config.maxEmptyCycles
    }, 'Starting SQS subscriber in one-shot mode');

    let processedCount = 0;
    let emptyCycles = 0;
    const maxEmptyCycles = this.config.maxEmptyCycles || 3;

    // Reset metrics
    this.metrics = {
      processedCount: 0,
      failedCount: 0,
      timeoutCount: 0,
      averageProcessingTime: 0,
      batchesProcessed: 0,
      successRate: 100,
      inFlightCount: 0,
      processingTimes: []
    };

    while (emptyCycles < maxEmptyCycles) {
      try {
        logger.debug({ 
          queueUrl: await this.ensureQueueUrl(),
          emptyCycles,
          maxEmptyCycles
        }, 'Polling SQS queue in one-shot mode');

        const request: SQSReceiveOptions = {
          queueUrl: await this.ensureQueueUrl(),
          maxNumberOfMessages: this.config.batchSize,
          visibilityTimeout: this.config.visibilityTimeout,
          waitTimeSeconds: this.config.waitTimeSeconds || 20,
          attributeNames: ['All'],
          messageAttributeNames: ['All']
        };

        const result = await SQSService.receiveMessages(request);
        
        if (!isSuccess(result)) {
          throw result.error;
        }
        
        const messages = result.data as Message[];
        
        if (messages.length > 0) {
          logger.info({ messageCount: messages.length }, 'Received messages from SQS in one-shot mode');
          
          // Process messages
          await this.processMessages(messages);
          
          // Update processed count
          processedCount += messages.length;
          
          // Reset empty cycles counter
          emptyCycles = 0;
        } else {
          logger.debug({ emptyCycles }, 'No messages received from SQS in one-shot mode');
          emptyCycles++;
        }
      } catch (error) {
        logger.error(getErrorInfo(error), 'Error polling SQS queue in one-shot mode');
        this.notifyError(error instanceof Error ? error : new Error(String(error)));
        emptyCycles++;
      }
      
      // Wait for poll interval before next attempt
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }

    logger.info({ 
      processedCount,
      failedCount: this.metrics.failedCount,
      successRate: this.metrics.successRate,
      averageProcessingTime: this.metrics.averageProcessingTime
    }, 'One-shot processing complete');

    return processedCount;
  }
}
