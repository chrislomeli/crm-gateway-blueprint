# Blueprint Project Configuration Strategy

This document outlines the configuration management strategy for the Blueprint project, designed to provide a developer-friendly, automated approach to managing configuration across different environments.

## Key Features

- **TypeScript-based Configuration Files**: Environment-specific configuration defined in TypeScript files
- **AWS Parameter Store Integration**: Secure storage and retrieval of configuration parameters
- **AWS Secrets Manager Integration**: Secure storage and resolution of secrets
- **Custom Tag Syntax for Secrets**: `!ssm<secret>[field]` syntax for referencing secrets
- **Layered Configuration**: Shared and app-specific configuration with clear precedence
- **Developer Tools**: CLI tools for parameter management during development and deployment
- **Validation**: Schema validation for configuration objects
- **Caching**: Efficient caching of configuration values
- **Connectivity Validation**: Health checks for MySQL, Elasticsearch, and Kafka

## Configuration Structure

The configuration system is structured in layers:

1. **Shared Configuration**: Common settings across all applications (MySQL, Elasticsearch, Kafka)
2. **Application-specific Configuration**: Settings specific to each application
3. **Environment Variables**: Used for overriding configuration at runtime
4. **Secrets**: Securely stored and resolved at runtime

## Configuration Files

### Shared Configuration

Shared configuration is defined in `packages/common/infrastructure/config/config.shared.ts` as a Map with environment keys:

```typescript
export const sharedConfig: SharedConfigMap = new Map([
  ['local', {
    mysql: { /* MySQL configuration */ },
    elasticsearch: { /* Elasticsearch configuration */ },
    kafka: { /* Kafka configuration */ }
  }],
  ['development', {
    // Development environment configuration
  }],
  // Additional environments
]);
```

### Application-specific Configuration

Each application defines its own configuration in a `config.app.ts` file in its directory:

```typescript
export const APP_NAME = 'your-app-name';

export const appConfig: AppConfigMap = new Map([
  ['local', {
    api: { /* API configuration */ },
    features: { /* Feature flags */ },
    // Other app-specific settings
  }],
  ['development', {
    // Development environment configuration
  }],
  // Additional environments
]);
```

## Secret Resolution

Secrets are referenced using the custom tag syntax `!ssm<secret>[field]`:

```typescript
mysql: {
  host: 'localhost',
  user: 'root',
  password: '!ssm<crmdb/local/root>[password]'
}
```

At runtime, the ConfigProvider resolves these tags by retrieving the actual secrets from AWS Secrets Manager.

## Developer Tools

### deploy-ts-config

The `deploy-ts-config` tool deploys configuration from TypeScript files to AWS Parameter Store:

```bash
# Deploy shared configuration
npx ts-node packages/tools/dev-bootstrap/deploy-ts-config.ts shared -e local

# Deploy application-specific configuration
npx ts-node packages/tools/dev-bootstrap/deploy-ts-config.ts app -a your-app-name -e local
```

### bootstrap-demo

The `bootstrap-demo` tool sets up the environment for running demos:

```bash
npx ts-node packages/tools/dev-bootstrap/bootstrap-demo.ts -a your-app-name -e local
```

### parameter-manager

The `parameter-manager` tool manages parameters in AWS Parameter Store:

```bash
# List parameters
npx ts-node packages/tools/dev-bootstrap/parameter-manager.ts list -e local

# Get a parameter
npx ts-node packages/tools/dev-bootstrap/parameter-manager.ts get -k local.shared.infrastructure

# Put a parameter
npx ts-node packages/tools/dev-bootstrap/parameter-manager.ts put -k local.your-app-name -v '{"key":"value"}'

# Delete a parameter
npx ts-node packages/tools/dev-bootstrap/parameter-manager.ts delete -k local.your-app-name
```

## Usage in Applications

Applications use the ConfigProvider to load and access configuration:

```typescript
import { ConfigProvider } from '../../../common/infrastructure/config/configProvider';

async function run() {
  // Initialize configuration
  await ConfigProvider.init({
    environment: 'local',
    appName: 'your-app-name'
  });
  
  // Get configuration
  const config = ConfigProvider.getConfig();
  
  // Access specific configuration values
  const apiPort = config.api.port;
  const mysqlHost = config.mysql.host;
  
  // ...
}
```

## Development Workflow

1. Define configuration in TypeScript files (`config.shared.ts` and `config.app.ts`)
2. Use `bootstrap-demo` to deploy configuration to AWS Parameter Store
3. Run your application, which will load configuration from AWS Parameter Store
4. Use `parameter-manager` to manage parameters during development

## Production Deployment

In production environments:

1. CI/CD pipeline deploys configuration to AWS Parameter Store
2. Applications load configuration from AWS Parameter Store at runtime
3. Secrets are resolved securely at runtime
4. Environment variables can be used to override specific configuration values

## Best Practices

1. **Keep Secrets Secure**: Always use the secret tag syntax for sensitive information
2. **Validate Configuration**: Use schema validation to ensure configuration is valid
3. **Use TypeScript**: Leverage TypeScript's type safety for configuration
4. **Follow Naming Conventions**: Use consistent naming for parameters
5. **Document Configuration**: Add comments to explain configuration options
6. **Test Configuration**: Verify configuration works in all environments
7. **Use Version Control**: Track configuration changes in version control
8. **Automate Deployment**: Use CI/CD to deploy configuration
