# Directory Package: simple-publisher
# Total files: 12
################################################################################

### FILE: Dockerfile
```
# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Set working directory
WORKDIR /app

# Copy root configuration files
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package files for current project structure
COPY packages/configuration/package.json ./packages/configuration/
COPY packages/core/package.json ./packages/core/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/framework/package.json ./packages/framework/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/services/package.json ./packages/services/
COPY packages/tsup-config/package.json ./packages/tsup-config/
COPY integrations/hubspot/package.json ./integrations/hubspot/
COPY services/simple-publisher/package.json ./services/simple-publisher/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/tsup-config ./packages/tsup-config
COPY packages/configuration ./packages/configuration
COPY packages/core ./packages/core
COPY packages/connectors ./packages/connectors
COPY packages/framework ./packages/framework
COPY packages/infrastructure ./packages/infrastructure
COPY packages/services ./packages/services
COPY integrations/hubspot ./integrations/hubspot
COPY services/simple-publisher ./services/simple-publisher

# Create cache directory for turbo
RUN mkdir -p /app/.turbo

# Build the project with turbo caching
RUN pnpm build --filter=@service/simple-publisher... --cache-dir=/app/.turbo

# Deploy the service to prepare for runtime (this resolves pnpm symlinks)
RUN pnpm --filter=@service/simple-publisher deploy --prod /app/deployed

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy the deployed service (with resolved dependencies)
COPY --from=builder /app/deployed ./

# Create config and secrets directories
RUN mkdir -p /config/shared /config/app /config/secrets

# Create nodejs user and set ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /config

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
```

### FILE: package.json
```
{
  "name": "@service/simple-publisher",
  "version": "1.0.0",
  "type": "module",
  "description": "HubSpot webhook publisher service for receiving and publishing webhook events to SQS",
  "main": "dist/main.js",
  "scripts": {
    "build": "node_modules/.bin/tsup",
    "dev": "node_modules/.bin/tsup --watch --onSuccess 'node dist/main.js'",
    "start": "node dist/main.js",
    "test": "vitest",
    "test:run": "vitest run",
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "@aws-sdk/client-sqs": "^3.0.0",
    "@platform/configuration": "workspace:*",
    "@platform/core": "workspace:*",
    "@platform/connectors": "workspace:*",
    "@platform/framework": "workspace:*",
    "@platform/infrastructure": "workspace:*",
    "@platform/services": "workspace:*",
    "@crm/hubspot": "workspace:*",
    "@hubspot/api-client": "^13.1.0",
    "axios": "^1.6.0",
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.0.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.2",
    "dd-trace": "^5.0.0",
    "dotenv": "^17.2.1",
    "nestjs-zod": "^5.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "hot-shots": "^11.2.0",
    "luxon": "^3.4.0",
    "p-limit": "^4.0.0",
    "ts-toolbelt": "^9.6.0",
    "ulid": "^3.0.1",
    "uuid": "^9.0.0",
    "uuid4": "^2.0.3",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/luxon": "^3.3.0",
    "@types/node": "^24.3.0",
    "@types/uuid": "^9.0.0",
    "@types/uuid4": "^2.0.3",
    "ts-node": "^10.9.2",
    "tsup": "^8.5.0",
    "typescript": "^5.9.2",
    "vitest": "^2.0.0"
  }
}
```

### FILE: tsconfig.json
```
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "paths": {
      "@platform/*": ["../../packages/*/src"],
      "@crm/*": ["../../integrations/*/src"]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

### FILE: tsup.config.ts
```
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  treeshake: true,
  dts: false,
  bundle: true,
  platform: 'node',

  // Bundle problematic CJS dependencies
  noExternal: [
    // Express ecosystem
    'express',
    'compression',
    'cors',
    'helmet',

    // Logging chain
    'pino',
    'pino-pretty',
    'sonic-boom',
    'thread-stream',
    'fast-redact',
    'on-exit-leak-free',
    'pino-abstract-transport',

    // Small utilities with CJS
    'uuid',
    'uuid4',
    'ulid',
    'axios'
  ],

  // Keep these external
  external: [
    // Workspace packages (use regex patterns for consistency)
    /^@platform\//,
    /^@service\//,
    /^@crm\//,

    // Large/Native/ESM-ready
    '@aws-sdk/client-sqs',
    '@hubspot/api-client',
    'dd-trace',

    // Pure ESM packages
    'zod',
    'p-limit',
    'dotenv',

    // Node built-ins
    'node:*',
    'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer', 'url',
    'http', 'https', 'net', 'child_process', 'worker_threads'
  ],

  esbuildOptions(options: Record<string, any>) {
    options.platform = 'node';
    options.packages = 'bundle';
    options.mainFields = ['module', 'main'];
    options.conditions = ['import', 'module', 'node', 'default'];
  }
});
```

### FILE: src/app.module.ts
```
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { WebhookModule } from './webhook/webhook.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    WebhookModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
```

### FILE: src/main.ts
```
#!/usr/bin/env node

/**
 * HubSpot Publisher Service - NestJS Main Bootstrap
 *
 * HTTP server that receives HubSpot webhook events and publishes them to SQS queues.
 * Containerized version using NestJS framework.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigProvider } from '@platform/configuration';
import { logger, serializeErrorForLogging } from '@platform/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  try {
    logger.info('Starting HubSpot Publisher Service...');

    // Try to initialize ConfigProvider but don't fail if it's not available
    try {
      await ConfigProvider.initialize({
        sharedConfigPath: '/config/shared',
        appConfigPath: '/config/app',
        secretsPath: '/config/secrets',
        enableSecrets: true,
        // Add these options to make it more resilient
        // throwOnMissingFile: false,
        // validateEnvironment: false
      });

      logger.info('ConfigProvider initialized successfully');
    } catch (configError) {
      logger.warn({
        error: serializeErrorForLogging(configError)
      }, 'ConfigProvider initialization failed, using environment variables as fallback');

      // Continue without ConfigProvider - service will use fallback values
    }

    // Create NestJS application
    const app = await NestFactory.create(AppModule, {
      logger: false // Use our platform logger instead
    });

    // Enable CORS if needed
    app.enableCors();

    // Get port from configuration
    const port = parseInt(process.env.PORT || '3000', 10);

    // Start the server
    await app.listen(port);

    logger.info({
      port,
      service: 'simple-publisher'
    }, 'HubSpot Publisher Service started successfully');

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error({ error: serializeErrorForLogging(error) }, 'Failed to start HubSpot Publisher Service');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error) => {
    console.error('Startup error:', error);
    process.exit(1);
  });
}
```

### FILE: src/webhook/webhook.controller.ts
```
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  OnModuleInit,
} from '@nestjs/common';
import { logger, serializeErrorForLogging } from '@platform/core';
import { WebhookService } from './webhook.service';
import {
  WebhookRequestDto,
  webhookRequestSchema,
  HubspotUpdateEventType
} from './dto/webhook-request.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { HubspotUpdateEvent } from '@crm/hubspot';

@Controller('webhook')
export class WebhookController implements OnModuleInit {
  constructor(private readonly webhookService: WebhookService) {
    logger.info('WebhookController constructor called');
    logger.info({
      serviceInjected: !!webhookService,
      serviceType: typeof webhookService,
      serviceConstructorName: webhookService?.constructor?.name,
      servicePrototype: Object.getOwnPropertyNames(Object.getPrototypeOf(webhookService || {})),
      isServiceInstance: webhookService instanceof WebhookService,
      serviceKeys: webhookService ? Object.keys(webhookService) : 'no-service'
    }, 'WebhookService injection status - DETAILED');
  }

  onModuleInit() {
    logger.info('WebhookController onModuleInit called');
    logger.info({
      serviceAvailable: !!this.webhookService,
      hasProcessTestEvent: typeof this.webhookService?.processTestEvent === 'function',
      hasProcessWebhookEvents: typeof this.webhookService?.processWebhookEvents === 'function'
    }, 'WebhookService methods availability');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(webhookRequestSchema))
  async processWebhook(@Body() request: WebhookRequestDto): Promise<any> {
    try {
      logger.info({
        body: request
      }, 'Webhook received');

      if (!this.webhookService) {
        throw new Error('WebhookService is not available');
      }

      // Parse webhook events from request body
      let events: HubspotUpdateEvent[];

      if (Array.isArray(request)) {
        events = request as HubspotUpdateEvent[];
      } else if (request && typeof request === 'object') {
        // Handle single event or wrapped events
        events = Array.isArray((request as any).events)
            ? (request as any).events
            : [request as HubspotUpdateEvent];
      } else {
        throw new Error('Invalid webhook payload format');
      }

      if (!events || events.length === 0) {
        logger.warn('No events found in webhook payload');
        return {
          error: 'No events found in payload',
          received: request
        };
      }

      // Process events using webhook service
      const result = await this.webhookService.processWebhookEvents(events);

      if (result.success) {
        return {
          success: true,
          messagesProcessed: result.messagesProcessed,
          eventCount: events.length,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          errors: result.errors,
          messagesProcessed: result.messagesProcessed,
          eventCount: events.length
        };
      }

    } catch (error) {
      logger.error({
        error: serializeErrorForLogging(error),
        serviceAvailable: !!this.webhookService
      }, 'Webhook processing error');

      // Return error response instead of throwing
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async processTestWebhook(): Promise<any> {
    try {
      logger.info('Test endpoint called');

      if (!this.webhookService) {
        logger.error('WebhookService is not injected');
        return {
          success: false,
          error: 'WebhookService is not available',
          timestamp: new Date().toISOString()
        };
      }

      if (typeof this.webhookService.processTestEvent !== 'function') {
        logger.error({
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.webhookService))
        }, 'processTestEvent method not found on service');
        return {
          success: false,
          error: 'processTestEvent method not available',
          timestamp: new Date().toISOString()
        };
      }

      const result = await this.webhookService.processTestEvent();

      return {
        message: 'Test event processed',
        result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error({
        error: serializeErrorForLogging(error),
        serviceAvailable: !!this.webhookService
      }, 'Test endpoint error');

      // Return error response instead of throwing
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}
```

### FILE: src/webhook/webhook.module.ts
```
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
```

### FILE: src/webhook/webhook.service.ts
```
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigProvider } from '@platform/configuration';
import { logger, serializeErrorForLogging } from '@platform/core';
import { HubspotWebhookProcessor, HubspotUpdateEvent } from '@crm/hubspot';

@Injectable()
export class WebhookService implements OnModuleInit {
  private webhookProcessor?: HubspotWebhookProcessor;
  private initialized = false;

  constructor() {
    logger.info('WebhookService constructor called');
    logger.info({
      timestamp: new Date().toISOString(),
      constructorContext: 'WebhookService',
      thisExists: !!this,
      prototypeChain: Object.getOwnPropertyNames(Object.getPrototypeOf(this))
    }, 'WebhookService constructor - DETAILED');
  }

  async onModuleInit() {
    logger.info('WebhookService onModuleInit called');
    try {
      await this.initializeProcessor();
    } catch (error) {
      logger.error({ error: serializeErrorForLogging(error) }, 'Failed to initialize processor on module init');
      // Don't throw - allow service to start and try lazy initialization
    }
  }

  private async initializeProcessor(): Promise<void> {
    if (this.initialized && this.webhookProcessor) {
      return; // Already initialized
    }

    try {
      // Load queue URLs with multiple fallback strategies
      const importQueueUrl = await this.getQueueUrl('sqs.hubspot.webhookImportQueueName', 'WEBHOOK_IMPORT_QUEUE_NAME', 'hubspot-webhook-import-queue');
      const singleQueueUrl = await this.getQueueUrl('sqs.hubspot.webhookSingleQueueName', 'WEBHOOK_SINGLE_QUEUE_NAME', 'hubspot-webhook-single-queue');
      const intentQueueUrl = await this.getQueueUrl('sqs.hubspot.intentQueueName', 'INTENT_QUEUE_NAME', 'hubspot-intent-queue');

      this.webhookProcessor = new HubspotWebhookProcessor(
          importQueueUrl,
          singleQueueUrl,
          intentQueueUrl
      );

      this.initialized = true;

      logger.info({
        importQueueUrl,
        singleQueueUrl,
        intentQueueUrl
      }, 'WebhookService processor initialized with queue URLs');
    } catch (error) {
      logger.error({ error: serializeErrorForLogging(error) }, 'Failed to initialize WebhookService processor');
      throw error;
    }
  }

  private async getQueueUrl(configKey: string, envKey: string, fallbackQueueName: string): Promise<string> {
    let queueName: string;

    // Try multiple strategies to get the queue name
    try {
      // Strategy 1: Try ConfigProvider
      if (typeof ConfigProvider.get === 'function') {
        queueName = ConfigProvider.get(configKey, '');
        if (queueName) {
          logger.debug({ configKey, queueName }, 'Got queue name from ConfigProvider');
        }
      }
    } catch (error) {
      logger.debug({ configKey }, 'ConfigProvider not available for key');
    }

    // Strategy 2: Try environment variable
    if (!queueName!) {
      queueName = process.env[envKey] || '';
      if (queueName) {
        logger.debug({ envKey, queueName }, 'Got queue name from environment variable');
      }
    }

    // Strategy 3: Use fallback
    if (!queueName) {
      queueName = fallbackQueueName;
      logger.debug({ fallbackQueueName }, 'Using fallback queue name');
    }

    // Determine the base URL
    const sqsEndpoint = process.env.SQS_ENDPOINT || 'http://localstack:4566';
    const accountId = process.env.AWS_ACCOUNT_ID || '000000000000';

    const queueUrl = `${sqsEndpoint}/${accountId}/${queueName}`;

    logger.debug({ queueUrl, queueName }, 'Constructed queue URL');

    return queueUrl;
  }

  async processWebhookEvents(events: HubspotUpdateEvent[]): Promise<any> {
    // Ensure processor is initialized
    if (!this.initialized || !this.webhookProcessor) {
      logger.info('Processor not initialized, attempting initialization');
      await this.initializeProcessor();
    }

    if (!this.webhookProcessor) {
      throw new Error('Failed to initialize webhook processor');
    }

    logger.info({ eventCount: events.length }, 'Processing webhook events');

    const result = await this.webhookProcessor.processAndSendWebhookBatch(events);

    if (result.success) {
      logger.info({
        messagesProcessed: result.messagesProcessed,
        eventCount: events.length
      }, 'Webhook events processed successfully');
    } else {
      logger.error({
        errors: result.errors,
        messagesProcessed: result.messagesProcessed,
        eventCount: events.length
      }, 'Webhook processing failed');
    }

    return result;
  }

  async processTestEvent(): Promise<any> {
    logger.info('ProcessTestEvent method called');

    // Ensure processor is initialized
    if (!this.initialized || !this.webhookProcessor) {
      logger.info('Processor not initialized, attempting initialization');
      await this.initializeProcessor();
    }

    if (!this.webhookProcessor) {
      throw new Error('Failed to initialize webhook processor');
    }

    logger.info('Processing test event');

    // Generate a test event
    const testEvent: HubspotUpdateEvent = {
      eventId: 'test-' + Date.now(),
      subscriptionId: 0,
      portalId: 12345,
      appId: 67890,
      occurredAt: Date.now(),
      subscriptionType: 'contact.propertyChange',
      attemptNumber: 0,
      objectId: 98765,
      changeSource: 'CRM_UI',
      propertyName: 'email',
      propertyValue: 'test@example.com'
    };

    return await this.processWebhookEvents([testEvent]);
  }
}
```

### FILE: src/webhook/dto/webhook-request.dto.ts
```
import { z } from 'zod';

// Zod schema for HubSpot webhook event validation
export const hubspotUpdateEventSchema = z.object({
  eventId: z.string(),
  subscriptionId: z.string().optional(),
  portalId: z.number(),
  appId: z.number().optional(),
  occurredAt: z.number(),
  subscriptionType: z.string(),
  attemptNumber: z.number().optional(),
  objectId: z.number(),
  changeSource: z.string().optional(),
  propertyName: z.string().optional(),
  propertyValue: z.string().optional(),
});

// Schema for webhook request (array of events or single event)
export const webhookRequestSchema = z.union([
  z.array(hubspotUpdateEventSchema),
  hubspotUpdateEventSchema,
  z.object({
    events: z.array(hubspotUpdateEventSchema),
  }),
]);

// Simple DTO class without createZodDto to avoid union type issues
export class WebhookRequestDto {
  // This will be validated by the ZodValidationPipe
}

// Type exports
export type HubspotUpdateEventType = z.infer<typeof hubspotUpdateEventSchema>;
export type WebhookRequestType = z.infer<typeof webhookRequestSchema>;
```

### FILE: src/health/health.controller.ts
```
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { logger, serializeErrorForLogging } from '@platform/core';

@Controller()
export class HealthController {
  
  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): any {
    return {
      status: 'healthy',
      service: 'simple-publisher',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async getReadiness(): Promise<any> {
    try {
      // Could add queue connectivity checks here
      return {
        status: 'ready',
        service: 'simple-publisher',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error: serializeErrorForLogging(error) }, 'Readiness check failed');
      return {
        status: 'not ready',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
```

### FILE: src/health/health.module.ts
```
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

