# Blueprint Resilience Module

This module provides resilience utilities for the Blueprint framework, including circuit breaker, retry, rate limiting, and alerting patterns. It's designed to make your applications more robust by handling transient failures gracefully and providing observability into critical operations.

## Key Features

- **Circuit Breaker Pattern**: Prevents cascading failures by stopping repeated calls to failing services
- **Retry Mechanisms**: Automatically retry failed operations with configurable backoff strategies
- **Rate Limiting**: Prevents overwhelming downstream services
- **Alerting**: Send alerts for critical operation failures to various channels (Datadog, PagerDuty, Slack)
- **Metrics Collection**: Track operation counts, durations, and error rates
- **Distributed Tracing**: Integrate with OpenTelemetry for end-to-end tracing
- **Standardized Error Handling**: Consistent error handling using the Result pattern

## Installation

This module is part of the `@platform/infrastructure` package and can be used by importing it:

```typescript
import { resilience } from '@platform/infrastructure';
```

## Usage

### Observable Functions

The core of the resilience module is the `ObservableFunction` template, which allows you to wrap any function with resilience and observability features:

```typescript
import { resilience } from '@platform/infrastructure';
import { ApplicationContext, Result, success, failure, createError } from '@platform/core';

// Create an observable function
const getUser = resilience.templates.createObservableFunction(
  {
    context: appContext,
    operationName: 'getUser',
    sidecarFeatures: {
      circuitBreaker: true,
      retry: true,
      metrics: true,
      spans: true,
      alerting: true
    },
    circuitBreakerConfig: {
      enabled: true,
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    },
    retryConfig: {
      enabled: true,
      retries: 3,
      minTimeout: 100,
      maxTimeout: 1000,
      factor: 2
    },
    alertConfig: {
      enabled: true,
      resourceName: 'UserService',
      alertOnCircuitOpen: true,
      alertOnRetryFailure: true,
      alertOnOperationFailure: true
    }
  },
  async () => {
    try {
      const user = await userService.getUser(userId);
      return success(user);
    } catch (error) {
      return failure(createError({
        type: 'UserServiceError',
        message: `Failed to get user: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the observable function
const result = await getUser();
if (result.success) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Resilient Database Operations

For database operations, you can use the `createResilientDatabaseOperation` utility:

```typescript
import { resilience } from '@platform/infrastructure';

// Create a resilient database query function
const getUserById = resilience.examples.createResilientDatabaseOperation(
  appContext,
  'getUserById',
  'MySQL',
  async () => {
    try {
      const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      return success(user);
    } catch (error) {
      return failure(createError({
        type: 'DatabaseError',
        message: `Failed to get user by ID: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the resilient function
const result = await getUserById();
if (result.success) {
  console.log('User:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### Resilient Cache Operations

For cache operations, you can use the `createResilientCacheOperation` utility:

```typescript
import { resilience } from '@platform/infrastructure';

// Create a resilient cache get function
const getFromCache = resilience.examples.createResilientCacheOperation(
  appContext,
  'getIntent',
  'Redis',
  async () => {
    try {
      const value = await redisClient.get(key);
      if (!value) {
        return failure(createError({
          type: 'CacheMiss',
          message: `Cache miss for key: ${key}`,
          statusCode: 404
        }));
      }
      return success(JSON.parse(value));
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to get from cache: ${error.message}`,
        statusCode: 500,
        cause: error
      }));
    }
  }
);

// Use the resilient function
const result = await getFromCache();
if (result.success) {
  console.log('Cache value:', result.value);
} else if (result.error?.type === 'CacheMiss') {
  console.log('Value not in cache');
} else {
  console.error('Cache error:', result.error);
}
```

### Alerting

The resilience module includes an alerting service that can be used to send alerts for critical operations:

```typescript
import { resilience } from '@platform/infrastructure';

// Create an alert service
const alertService = new resilience.alerting.AlertService({
  serviceName: 'my-service',
  environment: 'production',
  enableDatadog: true,
  enablePagerDuty: true,
  enableSlack: true
});

// Send a critical alert
await alertService.sendCriticalOperationAlert(
  'getUserById',
  'MySQL',
  new Error('Connection refused'),
  {
    userId: '123',
    retryAttempts: 3
  }
);
```

## Advanced Configuration

### Circuit Breaker Configuration

```typescript
const circuitBreakerConfig = {
  enabled: true,
  timeout: 5000,              // Timeout in milliseconds
  errorThresholdPercentage: 50, // Percentage of failures before opening circuit
  resetTimeout: 30000,        // Time before attempting to close circuit
  name: 'MyService'           // Name for the circuit breaker
};
```

### Retry Configuration

```typescript
const retryConfig = {
  enabled: true,
  retries: 3,           // Number of retry attempts
  minTimeout: 100,      // Minimum timeout between retries (ms)
  maxTimeout: 1000,     // Maximum timeout between retries (ms)
  factor: 2             // Exponential backoff factor
};
```

### Alert Configuration

```typescript
const alertConfig = {
  enabled: true,
  resourceName: 'MySQL',
  minimumSeverity: resilience.alerting.AlertSeverity.ERROR,
  alertOnCircuitOpen: true,
  alertOnRetryFailure: true,
  alertOnRateLimiting: true,
  alertOnOperationFailure: true
};
```

## Best Practices

1. **Use Domain-Specific Wrappers**: Create domain-specific wrappers around the resilience utilities for better organization and reusability.

2. **Configure Circuit Breakers Appropriately**: Set appropriate thresholds and timeouts based on the expected behavior of your services.

3. **Use Retry with Caution**: Only retry operations that are idempotent or can safely be repeated.

4. **Monitor and Alert**: Use the metrics and alerting features to monitor the health of your services and get notified of issues.

5. **Test Failure Scenarios**: Test your resilience patterns with simulated failures to ensure they work as expected.

## Integration with Other Blueprint Packages

The resilience module is designed to work seamlessly with other Blueprint packages:

- **@platform/core**: Uses the Result pattern for error handling
- **@crm/observability**: Integrates with metrics and tracing
- **@crm/health**: Integrates with health monitoring

## Contributing

If you'd like to contribute to this module, please follow the Blueprint framework's contribution guidelines.
