
```typescript
import Bottleneck from 'bottleneck';
import { Message } from '@aws-sdk/client-sqs';

// Your concurrency controller for AI API calls
const aiApiLimiter = new Bottleneck({
    maxConcurrent: 5,  // Only 5 AI calls at once per container
    minTime: 0         // No rate limiting here (your REST client handles that)
});

// Intent cache (loaded once at startup)
let intentCache: Map<string, any>;

// Initialize on container start
export async function initializeContainer() {
    console.log('Loading intent cache...');
    intentCache = await loadIntentCache();
    console.log(`Cache loaded with ${intentCache.size} entries`);
}

// Main message handler - called by your SQS poller
export async function handleMessage(sqsMessage: Message): Promise<void> {
    const record = JSON.parse(sqsMessage.Body!);

    try {
        // Parallel operations
        const [intentFound, _] = await Promise.all([
            // Check intent (fast, in-memory)
            checkIntent(record),

            // Always store to ElasticSearch (parallel with intent check)
            storeInfo({
                ...record,
                processedAt: new Date().toISOString(),
                messageId: sqsMessage.MessageId
            })
        ]);

        // If intent found, make AI API call (rate limited)
        if (intentFound) {
            await processWithAI(record);
        }

        // Success - message will be deleted by poller
        console.log(`Successfully processed message ${sqsMessage.MessageId}`);

    } catch (error) {
        // Log and re-throw - message will be retried by SQS
        console.error(`Failed to process message ${sqsMessage.MessageId}:`, error);
        throw error;
    }
}

// Check if record has intent
async function checkIntent(record: any): Promise<boolean> {
    return hasIntent(record, intentCache);
}

// Process with AI - this gets rate limited
async function processWithAI(record: any): Promise<void> {
    // This will wait if all 5 slots are busy
    await aiApiLimiter.schedule(async () => {
        try {
            console.log(`Calling AI API for record ${record.id}`);

            // Your existing REST client with circuit breaker & retry
            const result = await callDecisionAPI(record);

            // Store AI result
            await storeInfo({
                ...record,
                aiResult: result,
                aiProcessedAt: new Date().toISOString()
            });

            console.log(`AI API call successful for record ${record.id}`);

        } catch (error) {
            // Your REST client already retried, so this is final failure
            console.error(`AI API call failed for record ${record.id}:`, error);

            // Store failure info
            await storeInfo({
                ...record,
                aiError: error.message,
                aiFailedAt: new Date().toISOString()
            });

            // Don't re-throw - we've logged it, move on
        }
    });
}

// Main processing function for batch of messages
export async function processBatch(messages: Message[]): Promise<void> {
    console.log(`Processing batch of ${messages.length} messages`);

    // Process all messages concurrently (up to 10)
    await Promise.all(
        messages.map(message => handleMessage(message))
    );
}

// Example of how your SQS poller would use this
class SQSProcessor {
    async start() {
        // Initialize once
        await initializeContainer();

        // Your existing SQS polling logic
        while (true) {
            const messages = await this.pollSQS(); // Your existing poller

            if (messages.length > 0) {
                try {
                    await processBatch(messages);

                    // Delete successfully processed messages
                    await this.deleteMessages(messages);
                } catch (error) {
                    console.error('Batch processing error:', error);
                    // SQS will retry failed messages
                }
            }
        }
    }
}
```