/**
 * intent.consumer.ts
 *
 * Implements the MessageProcessor interface from the SQS subscriber library
 * to process SQS messages for HubSpot webhook event processing.
 */
import {ApplicationContext, isFailure, logger, serializeErrorForLogging} from '@platform/core';
import { v4 as uuidv4 } from "uuid";
import {ConfigProvider} from "@platform/configuration";
import * as os from "os";
import {BaseSubscriber, MessageProcessor, SubscriberConfig} from "@platform/services";


/**
 * Set up the webhook subscriber
 * Set up the subscriber and start processing
 * Creates a MessageProcessor and passes it to the poller
 *
 */
export async function processWebhookMessages(messageProcessor: MessageProcessor, context: ApplicationContext) {
    try {

        // Initialize configuration status monitoring
        logger.info('Initializing configuration status monitoring...');
        await ConfigProvider.initialize();



        // Generate worker ID
        const workerId = `${os.hostname()}-${process.pid}-${uuidv4().substring(0, 8)}`;
        const gracefulShutdown = Number(5000) ;

        // Initialize publishing
        logger.info('Initializing publishing...');
        const serverMode = context.identity.serverMode ?? false;

        // Create SQS subscriber configuration
        const subscriberConfig: SubscriberConfig = {
            queueName: await ConfigProvider.get('shared.sqs.hubspot.intentQueueName') as string,
            batchSize: Number(await ConfigProvider.get('sqs.batchSize', 10)),
            visibilityTimeout: Number(await ConfigProvider.get('sqs.visibilityTimeout',500)),
            pollInterval: Number(await ConfigProvider.get('sqs.pollInterval')),
            maxRetries: 3,
            oneShotMode: !serverMode,
            maxEmptyCycles: 3
        };

         if (serverMode) {
            // Create an always-up listener

            // Initialize and start SQS subscriber if enabled
            let sqsSubscriber: BaseSubscriber | null = null;

            logger.info({
                queueName: subscriberConfig.queueName,
                batchSize: subscriberConfig.batchSize,
                visibilityTimeout: subscriberConfig.visibilityTimeout,
                pollInterval: subscriberConfig.pollInterval
            }, '🔄 ++ SQS SUBSCRIBER CONFIG ++');

            // Create SQS subscriber with tenant processing configuration
            sqsSubscriber = new BaseSubscriber(
                messageProcessor,
                subscriberConfig
            );

            // Set up error handler
            sqsSubscriber.onError((error) => {
                logger.error({ error: serializeErrorForLogging(error) }, '❌ onError: SQS Subscriber Error');
                logger.error({
                    error: serializeErrorForLogging(error),
                    queueName: subscriberConfig.queueName,
                    subscriberConfig
                }, 'SQS subscriber encountered an error');
            });

            const workerId = `${os.hostname()}-${process.pid}-${uuidv4().substring(0, 8)}`;

            // Set up message processed handler
            sqsSubscriber.onMessageProcessed((messageId, result) => {
                if (result.success) {
                    logger.info({ messageId }, '✅ onMessageProcessed: SQS Message Processed Successfully');
                    if (result.outcome) {
                        result.outcome.forEach((output: Record<string, any>) => {
                            const result = output.value;
                            if (!result.success) {
                                logger.error({ result }, 'Processing error');
                            } else if (result.success && result.data.data) {
                                logger.info({ data: result.data.data }, 'Processing success');
                            } else {
                                logger.info({ message: result.message }, 'Processing skipped');
                            }
                        });
                    }


                } else {
                    logger.error({
                        error: result.error,
                        messageId,
                        queueName: subscriberConfig.queueName
                    }, 'SQS message processing failed');
                }
            });

            // Log every message received for debugging
            sqsSubscriber.onMessageReceived((messageId) => {
                logger.debug({ messageId }, '✅ onMessageReceived: Message Received');
            });

            await sqsSubscriber.start();
            logger.info({ queueName: subscriberConfig.queueName }, '✅ start: SQS Subscriber Started');

            // Set up graceful shutdown
            let isShuttingDown = false;

            const shutdown = async (signal: string) => {
                if (isShuttingDown) return;
                isShuttingDown = true;

                logger.info({workerId: workerId, signal}, 'shutdown: Shutting down webhook service');

                // Stop SQS subscriber if running
                if (sqsSubscriber) {
                    logger.info('Stopping SQS subscriber...');
                    await sqsSubscriber.stop();
                    logger.info('SQS subscriber stopped');
                }

                // Wait for graceful shutdown
                setTimeout(() => {
                    logger.error({workerId: workerId}, 'Forced shutdown after timeout');
                    process.exit(1);
                }, gracefulShutdown);
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
        } else {
            // In one-shot mode, we'll process messages once and then exit
            logger.debug('Running in one-shot mode - will process available messages and then exit');

            try {
                // Create SQS subscriber with one-shot configuration
                const sqsSubscriber = new BaseSubscriber(
                    messageProcessor,
                    subscriberConfig
                );
                // Run in one-shot mode
                const processedCount = await sqsSubscriber.runOneShot();

                logger.info({ processedCount }, '✅ One-shot processing complete');

                // Exit with success code after processing
                process.exit(0);
            } catch (error) {
                logger.error({ error: serializeErrorForLogging(error) }, 'Error during one-shot processing');
                process.exit(1);
            }
        }
    } catch (error) {
        logger.error({ error: serializeErrorForLogging(error) }, 'Error starting batch importer service');
        process.exit(1);
    }
}
