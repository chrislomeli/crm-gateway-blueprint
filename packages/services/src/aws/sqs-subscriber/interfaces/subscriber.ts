/**
 * Core interfaces for the SQS subscriber library
 */
import { Message } from '@aws-sdk/client-sqs';
import {Result} from "@platform/core";

/**
 * Message statuses for tracking in the status store
 */
export type MessageStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry_pending';

/**
 * Configuration for the SQS subscriber
 */
export interface SubscriberConfig {
  /** URL of the main SQS queue */
  queueName: string;
  /** URL of the Dead Letter Queue (DLQ) */
  dlqUrl?: string;
  /** Number of messages to fetch in each batch */
  batchSize: number;
  /** Visibility timeout for messages (in seconds) */
  visibilityTimeout: number;
  /** Maximum number of retries before moving to DLQ */
  maxRetries?: number;
  /** Timeout for worker processing (in milliseconds) */
  workerTimeout?: number;
  /** Interval between polling attempts (in milliseconds) */
  pollInterval: number;
  /** Wait time for long polling (in seconds) */
  waitTimeSeconds?: number;
  /** Delay between retries (in seconds) */
  retryDelay?: number;
  /** Unique identifier for this subscriber instance */
  subscriberId?: string;
  /** S3 bucket name (for file processing) */
  s3Bucket?: string;
  /** S3 prefix (for file processing) */
  s3Prefix?: string;
  /** Run in one-shot mode (process all available messages and exit) */
  oneShotMode?: boolean;
  /** Maximum number of empty cycles before exiting in one-shot mode */
  maxEmptyCycles?: number;
}

/**
 * Context provided to message processors
 */
export interface MessageContext<T = any> {
  /** Unique identifier for the message */
  messageId: string;
  /** Parsed message body with type safety */
  body: T;
  /** Raw SQS message for advanced use cases */
  raw: Message;
}

/**
 * Result of processing a message
 */
export interface WorkerResult {
  /** Whether processing was successful */
  success: boolean;
  /** Error that occurred during processing (if any) */
  error?: Error;
  /** Whether the message should be retried if processing failed */
  retryable?: boolean;

  /** Whether the message should be retried if processing failed */
  outcome?: Record<string, any>;



}

/**
 * Interface for message processors
 */
export interface MessageProcessor<T = any> {
  /** Process a message from the queue */
  process(context: MessageContext<T>): Promise<WorkerResult>;
}

/**
 * Interface for storing message status
 */
export interface StatusStore {
  /** Get the status of a message */
  getStatus(messageId: string): Promise<MessageStatus | null>;
  /** Set the status of a message */
  setStatus(messageId: string, status: MessageStatus): Promise<void>;
  /** Clear the status of a message */
  clearStatus(messageId: string): Promise<void>;
}

/**
 * Basic metrics for subscriber performance monitoring
 */
export interface SubscriberMetrics {
  /** Number of messages processed successfully */
  processedCount: number;
  /** Number of messages that failed processing */
  failedCount: number;
  /** Number of messages that timed out during processing */
  timeoutCount: number;
  /** Average processing time in milliseconds */
  averageProcessingTime: number;
  /** Number of batches processed */
  batchesProcessed: number;
  /** Messages processed per minute */
  messagesPerMinute?: number;
  /** Processing latency percentiles */
  processingLatencyP50?: number;
  processingLatencyP95?: number;
  processingLatencyP99?: number;
  /** Success rate as a percentage */
  successRate: number;
  /** Number of messages currently being processed */
  inFlightCount: number;
  /** Array of processing times for calculating averages */
  processingTimes: number[];
  /** Number of messages moved to DLQ */
  movedToDlqCount?: number;
  /** Number of messages in DLQ */
  dlqCount?: number;
  /** Number of retried messages */
  retryCount?: number;
}

/**
 * Queue status information
 */
export interface QueueStatus {
  /** Approximate number of messages in the queue */
  approximateNumberOfMessages: number;
  /** Approximate number of messages not visible (in flight) */
  approximateNumberOfMessagesNotVisible: number;
  /** Approximate number of messages delayed */
  approximateNumberOfMessagesDelayed: number;
  /** Timestamp when the status was last checked */
  lastCheckedTimestamp: Date;
}

/**
 * Main subscriber interface
 */
export interface Subscriber<T = any> {
  /** Start the subscriber */
  start(): Promise<void>;
  /** Stop the subscriber */
  stop(): Promise<void>;
  /** Pause processing without full shutdown */
  pause(): Promise<void>;
  /** Resume processing after pause */
  resume(): Promise<void>;
  /** Register an error handler */
  onError(handler: (error: Error) => void): void;
  /** Register a status change handler */
  onStatusChange(handler: (messageId: string, status: MessageStatus) => void): void;
  /** Register a message received handler */
  onMessageReceived(handler: (messageId: string) => void): void;
  /** Register a message processed handler */
  onMessageProcessed(handler: (messageId: string, result: WorkerResult) => void): void;
  /** Update subscriber configuration at runtime */
  updateConfig(config: Partial<SubscriberConfig>): void;
  /** Get current configuration */
  getConfig(): SubscriberConfig;
  /** Get current queue status (depth, etc) */
  getQueueStatus(): Promise<QueueStatus>;
  /** Reprocess a failed message from DLQ */
  reprocessFromDLQ(messageId: string): Promise<void>;
  /** Move a message to DLQ without processing */
  moveToDeadLetter(messageId: string, reason: string): Promise<void>;
  /** Purge all messages from the queue */
  purgeQueue(): Promise<void>;
  /** Run in one-shot mode (process all available messages and exit) */
  runOneShot(): Promise<number>;
  /** Set message processor */
  setMessageProcessor(processor: MessageProcessor<T>): void;
}
