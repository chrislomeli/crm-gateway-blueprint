# Building a Blueprint Application: Step-by-Step Walkthrough

This document provides a comprehensive guide to building an application using the Blueprint framework. We'll walk through each step of the process, from setting up the environment to creating and configuring your application.

## Prerequisites

Before you begin, ensure you have:

- Docker and Docker Compose installed
- AWS CLI configured for local development
- Node.js and npm installed
- Access to the Blueprint repository

## Step 1: Set up the Docker Environment

The Blueprint framework relies on several services that run in Docker containers. Start by bringing up the Docker environment:

```bash
# Start all required publishing
docker-compose up -d
```

After starting Docker, deploy the shared configuration parameters to AWS Parameter Store:

```bash
# Deploy shared configuration to Parameter Store
bash packages/tools/dev-bootstrap/config-manager.sh deploy-shared -e local -f packages/tools/dev-bootstrap/config/shared-config.yaml
```

This step deploys shared infrastructure parameters that are required by all applications. The shared configuration contains common settings like:
- Database connection details
- Service endpoints
- Common feature flags
- Shared infrastructure settings

These parameters are stored in AWS Parameter Store under the key `local.shared.infrastructure` and can be accessed by any application. If you need to add new shared parameters in the future, you would modify the `shared-config.yaml` file and run this command again.

Next, seed the S3 bucket with initial data:

```bash
# Run the S3 seeding script
bash packages/tools/dev-bootstrap/seed-s3-local.sh
```

This script creates an S3 bucket in the LocalStack environment and populates it with sample data.

## Step 2: Create a Context Provider

Every Blueprint application needs a context provider that defines its identity and configuration. The context provider is a TypeScript file that extends the `AbstractContextProvider` class.

1. Create a directory structure for your application:

```bash
mkdir -p packages/publishing/utils/config-demo/src
```

2. Create a `context-provider.ts` file in the `src` directory:

```typescript
/**
 * context-provider.ts - Context Utilities for Config Demo Application
 */
import { AbstractContextProvider } from '@common/framework/runtime/context/abstractContextProvider';
import { ApplicationContext } from '@common/infrastructure/config/interfaces/applicationContext';

/**
 * Concrete implementation of the context provider for Config Demo Application
 */
export class ConfigDemoContextProvider extends AbstractContextProvider {
    // Singleton pattern
    private static instance: ConfigDemoContextProvider | null = null;

    // Define the complete application context directly
    private applicationContext: ApplicationContext = {
        identity: {
            appName: 'config-demo',
            namespace: 'utils',
            integration: 'utility',
            operation: 'demo-config',
            // Add version and runtime info from the abstract provider
            version: {
                git: this.getGitInfo(),
                build: process.env.BUILD_ID
            },
            runtime: this.getRuntimeInfo()
        },
        configurationKeys: {
            parameterKey: 'config-demo',
            secretsKeys: {
                demoApiKey: "!ssm<config-demo>[apiKey]"
            }
        }
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): ConfigDemoContextProvider {
        if (!ConfigDemoContextProvider.instance) {
            ConfigDemoContextProvider.instance = new ConfigDemoContextProvider();
        }
        return ConfigDemoContextProvider.instance;
    }

    getApplicationContext(): ApplicationContext {
        return this.applicationContext;
    }
}

/**
 * Gets the application context for the config demo application
 */
export function getApplicationContext(): ApplicationContext {
    return ConfigDemoContextProvider.getInstance().getApplicationContext();
}

// Export APP_IDENTITY for backward compatibility
export const APP_IDENTITY = {
    appName: 'config-demo',
    namespace: 'utils',
    integration: 'utility',
    operation: 'demo-config'
};
```

The context provider defines:
- The application's identity (name, namespace, etc.)
- Configuration keys for parameters and secrets
- Git and runtime information
- A singleton pattern for consistent context access

## Step 3: Create Configuration Files

Blueprint applications use three types of YAML files for configuration:

1. **Shared Configuration**: Infrastructure settings used by multiple applications
2. **Application-Specific Configuration**: Settings for your specific application
3. **Secrets Configuration**: Sensitive information like passwords and API keys

### 3.1 Create Configuration Directories

```bash
mkdir -p packages/publishing/utils/config-demo/config
```

### 3.2 Create Application-Specific Configuration

Create a file named `config-demo.yaml` in the `config` directory:

```yaml
# Configuration for the Config Demo Application - Local Environment
application:
  name: config-demo
  version: 1.0.0
  description: "Demo application for configuration management"

features:
  enableLogging: true
  enableMetrics: true
  enableTracing: false

database:
  host: localhost
  port: 3307
  name: config_demo
  user: root
  password: password

api:
  port: 3010
  basePath: "/api/v1"
  rateLimit: 100
  timeout: 30000

logging:
  level: debug
  format: json
  destination: console

metrics:
  enabled: true
  endpoint: "http://localhost:9090"
  interval: 15000
```

### 3.3 Create Secrets Configuration

Create a file named `config-demo-secrets.yaml` in the `config` directory:

```yaml
# Secrets Configuration for the Config Demo Application
# These values will be stored in AWS Secrets Manager

# API Key referenced in our context provider
apiKey: "demo-api-key-12345"
```

### 3.4 Verify Shared Configuration

The shared configuration is already available in the Blueprint framework. It contains common settings for infrastructure components like logging, metrics, and AWS services. You can view it at:

```
packages/tools/dev-bootstrap/config/shared-config.yaml
```

## Step 4: Load Configuration to AWS

Now that we have created our configuration files, we need to load them into AWS Parameter Store and Secrets Manager:

### 4.1 Load Shared Configuration

First, ensure the shared configuration is loaded into Parameter Store:

```bash
bash packages/tools/dev-bootstrap/config-manager.sh deploy-shared -e local -f packages/tools/dev-bootstrap/config/shared-config.yaml
```

### 4.2 Load Application-Specific Configuration

Next, load your application-specific configuration:

```bash
bash packages/tools/dev-bootstrap/config-manager.sh deploy-app -a config-demo -e local -f packages/publishing/utils/config-demo/config/config-demo.yaml
```

### 4.3 Load Secrets Configuration

Finally, load your secrets configuration:

```bash
bash packages/tools/dev-bootstrap/config-manager.sh deploy-secrets -e local -f packages/publishing/utils/config-demo/config/config-demo-secrets.yaml
```

## Step 5: Verify Configuration

After loading your configuration, you can verify that it was loaded correctly:

### 5.1 List Parameters in Parameter Store

```bash
bash packages/tools/dev-bootstrap/config-manager.sh list-parameters -e local
```

### 5.2 Check Application Parameters

You can verify that your application parameters exist using the check-parameters.ts script:

```bash
npx ts-node packages/tools/dev-bootstrap/check-parameters.ts --app config-demo --env local
```

## Step 6: Create Application Code

Now that your configuration is set up, you can create your application's main code files:

1. Create an intents-processor.ts file for your application
2. Implement your business logic
3. Add tests for your application

## Step 7: Build and Run Your Application

Finally, build and run your application:

```bash
# Build the application
npm run build --workspace=packages/publishing/utils/config-demo

# Run the application
npm run start --workspace=packages/publishing/utils/config-demo
```

## Troubleshooting

If you encounter issues during this process, check the following:

- Ensure Docker is running and all services are healthy
- Verify that your configuration files are valid YAML
- Check that your context provider is correctly implemented
- Ensure that the Parameter Store is accessible from your environment

For more detailed information, refer to the Blueprint framework documentation.
