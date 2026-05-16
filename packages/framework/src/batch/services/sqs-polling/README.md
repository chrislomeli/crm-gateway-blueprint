# SQS Polling Framework for Batch Importers

This framework provides a reusable base for SQS message polling and processing, with specific implementations for batch importers. It's designed to unify the batch importer container scaling and CRM adapter handling, ensuring consistent, maintainable, and scalable SQS message consumption patterns across batch importers.

## Architecture

The framework consists of these key components:

1. **BaseSQSWorkerService**: A reusable base class for SQS polling workers that handles:
   - SQS client setup and configuration
   - Message polling and batching
   - Message receipt and deletion
   - Error handling and classification
   - Graceful shutdown

2. **MessageProcessor Interface**: Defines the contract for processing SQS messages:
   - `processMessage`: Process a single SQS message
   - `initialize`: Optional lifecycle method for setup
   - `shutdown`: Optional lifecycle method for cleanup

3. **BatchImporterSQSWorker**: Extends BaseSQSWorkerService for batch importers:
   - Uses a CRM adapter registry to route messages
   - Implements the MessageProcessor interface
   - Handles CRM-specific message processing

4. **CRMAdapterRegistry**: Manages CRM adapters:
   - Registers adapters by CRM type
   - Retrieves adapters for message processing
   - Provides list of supported CRM types

5. **CRMAdapter Interface**: Contract for CRM-specific adapters:
   - `getCrmType`: Returns the CRM type this adapter handles
   - `importTenant`: Processes a tenant import request

## Usage

### Creating a CRM Adapter

```typescript
import { CRMAdapter, TenantInfo, Result } from '@framework/batch/services/sqs-polling/BatchImporterSQSWorker';

export class MyCustomCRMAdapter implements CRMAdapter {
  getCrmType(): string {
    return 'mycustomcrm';
  }

  async importTenant(tenant: TenantInfo): Promise<Result<any>> {
    // Implement your CRM-specific import logic here
    try {
      // Your import logic
      return {
        success: true,
        data: { /* result data */ }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          retryable: true // Set to false if this error should not be retried
        }
      };
    }
  }
}
```

### Setting Up the Batch Importer Service

```typescript
import { 
  BatchImporterSQSWorker, 
  CRMAdapterRegistry 
} from '@framework/batch/services/sqs-polling/BatchImporterSQSWorker';
import { MyCustomCRMAdapter } from './MyCustomCRMAdapter';

async function main() {
  // Create config
  const config = {
    workerId: 'worker-1',
    sqsQueueUrl: 'https://sqs.region.amazonaws.com/account/queue',
    sqsBatchSize: 1,
    sqsVisibilityTimeout: 300,
    sqsPollInterval: 1000
  };

  // Create CRM adapter registry
  const adapterRegistry = new CRMAdapterRegistry();
  
  // Register CRM adapters
  adapterRegistry.register(new MyCustomCRMAdapter());
  
  // Create batch importer SQS worker
  const worker = new BatchImporterSQSWorker(config, adapterRegistry);
  
  // Initialize worker
  await worker.initialize();
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.shutdown();
    process.exit(0);
  });
}

main().catch(console.error);
```

### Sending Messages to the Batch Importer Queue

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

async function sendBatchImportMessage(tenant, queueUrl) {
  const sqsClient = new SQSClient({ region: 'us-west-2' });
  
  const messageBody = JSON.stringify({
    crmType: tenant.crm,
    tenant
  });
  
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: messageBody,
    MessageAttributes: {
      CRMType: {
        DataType: 'String',
        StringValue: tenant.crm
      },
      TenantId: {
        DataType: 'String',
        StringValue: tenant.businessId
      }
    }
  });
  
  const result = await sqsClient.send(command);
  return result.MessageId;
}
```

## Configuration

The SQS polling framework can be configured using environment variables or the ConfigProvider:

| Configuration | Environment Variable | ConfigProvider Key | Default |
|---------------|---------------------|-------------------|---------|
| SQS Queue URL | QUEUE_URL | imports.sqsQueueUrl | http://localstack:4566/000000000000/batch-import-queue |
| SQS Batch Size | - | imports.sqsBatchSize | 1 |
| SQS Visibility Timeout | - | imports.sqsVisibilityTimeout | 300 |
| SQS Poll Interval | - | imports.sqsPollInterval | 1000 |
| S3 Bucket | BUCKET_NAME | imports.bucket | crmdata |
| S3 Prefix | - | imports.prefix | imports |
| Graceful Shutdown Timeout | - | worker.gracefulShutdownMs | 30000 |

## Error Handling

The framework classifies errors as retryable or non-retryable:

- **Retryable errors**: Temporary failures that might succeed on retry (e.g., network issues)
- **Non-retryable errors**: Permanent failures that won't succeed on retry (e.g., invalid message format)

When a retryable error occurs, the message is not deleted from the queue, allowing SQS visibility timeout to expire and the message to be reprocessed.

## Best Practices

1. **Message Format**: Always include `crmType` and `tenant` in the message body
2. **Error Classification**: Properly classify errors as retryable or non-retryable
3. **Adapter Implementation**: Keep adapters focused on CRM-specific logic
4. **Monitoring**: Add monitoring and metrics for queue depth and processing errors
5. **Dead Letter Queue**: Configure a dead letter queue for messages that fail repeatedly
