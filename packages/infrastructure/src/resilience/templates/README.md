# Blueprint Observable Pattern

This module provides resilience and observability features for resource connectors and operations in the Blueprint framework. It implements patterns such as circuit breaker, retry, rate limiting, metrics collection, distributed tracing, and standardized error handling.

## Two Implementation Approaches

The Observable pattern in Blueprint can be used in two ways:

1. **Inheritance-based approach** (Original): Extend the `Observable` abstract class
2. **Function-based approach** (New): Use static methods to wrap any async function

Both approaches provide the same resilience and observability features, but offer different programming models to suit different use cases.

## Inheritance-Based Approach

The inheritance-based approach uses the Template Method pattern where subclasses implement a `run()` method, and the base class provides lifecycle management and observability features.

### When to use:
- For stateful services with multiple operations
- When you need lifecycle management (initialize/shutdown)
- When extending existing Observable-based code

### Example:

```typescript
import { Observable } from '@framework/runtime/templates/Observable';
import { Result, success, failure, createError } from '@framework/results';

class UserService extends Observable {
  constructor(context) {
    super(context);
    
    // Configure features
    this.withCircuitBreaker({
      enabled: true,
      timeout: 5000,
      errorThresholdPercentage: 50
    });
    
    this.withRetry({
      enabled: true,
      retries: 3
    });
  }

  // Override operationName for better observability
  protected get operationName(): string {
    return 'getUserById';
  }

  // Implement the abstract run() method
  protected async run(): Promise<Result<User>> {
    // Core implementation
    return success(user);
  }

  // Additional operations using executeOperation
  public async getUserByEmail(email: string): Promise<Result<User>> {
    return this.executeOperation('getUserByEmail', async () => {
      // Implementation
      return success(user);
    });
  }
}

// Usage
const service = new UserService(context);
await service.initialize();
const result = await service.execute(); // Calls run() with observability
await service.shutdown();
```

## Function-Based Approach

The function-based approach wraps any async function with the same resilience and observability features without requiring inheritance.

### When to use:
- For standalone operations that need observability
- When you want to avoid inheritance
- When you prefer a more functional programming style

### Example:

```typescript
import { Observable } from '@framework/runtime/templates/Observable';
import { Result, success } from '@framework/results';

// Create an observable function
const getUserById = Observable.createObservable(
  context,
  'getUserById',
  async (): Promise<Result<User>> => {
    // Implementation
    return success(user);
  },
  {
    sidecarFeatures: {
      circuitBreaker: true,
      retry: true
    },
    circuitBreakerConfig: {
      enabled: true,
      timeout: 5000
    },
    retryConfig: {
      enabled: true,
      retries: 3
    }
  }
);

// Use the function
const result = await getUserById();

// Or execute directly in one step
const result = await Observable.executeObservable(
  context,
  'getUserById',
  async () => {
    // Implementation
    return success(user);
  }
);
```

## Configuration Options

Both approaches support the same configuration options:

### Circuit Breaker
- `enabled`: Enable/disable circuit breaker
- `timeout`: Time in ms before a request is considered failed
- `errorThresholdPercentage`: Percentage of failures before opening circuit
- `resetTimeout`: Time in ms before attempting to close circuit

### Retry
- `enabled`: Enable/disable retry
- `retries`: Number of retry attempts
- `minTimeout`: Minimum time between retries
- `maxTimeout`: Maximum time between retries
- `factor`: Exponential backoff factor

### Rate Limiting
- `enabled`: Enable/disable rate limiting
- `tokensPerInterval`: Number of operations allowed per interval
- `interval`: Time interval for token replenishment
- `redisConfig`: Optional Redis configuration for distributed rate limiting

### Metrics and Tracing
- Automatically configured based on OpenTelemetry environment variables
- Collects operation duration, success/failure rates, and circuit breaker state

## Best Practices

1. **Choose the right approach** based on your use case:
   - Use inheritance for stateful services with lifecycle management
   - Use functional approach for standalone operations

2. **Configure circuit breaker** appropriately:
   - Set timeout based on expected operation duration
   - Set error threshold based on acceptable failure rate
   - Set reset timeout based on how quickly to retry after failures

3. **Configure retry** based on operation characteristics:
   - Use fewer retries for user-facing operations
   - Use more retries for background operations
   - Set appropriate backoff to avoid overwhelming downstream services

4. **Use meaningful operation names** for better observability:
   - Override `operationName` in inheritance approach
   - Provide descriptive operation name in functional approach

5. **Handle fallbacks** for critical operations:
   - Configure fallback handlers for graceful degradation
   - Return partial results when possible

## Integration with Blueprint Framework

The Observable pattern integrates with other Blueprint framework components:

- Uses `Result<T>` pattern for consistent error handling
- Integrates with OpenTelemetry for metrics and tracing
- Works with Blueprint's ApplicationContext for service identity
- Integrates with HealthService for health monitoring

## See Also

- [ObservableFunction.ts](./ObservableFunction.ts) - Implementation of the functional approach
- [Observable.ts](./Observable.ts) - Implementation of the inheritance-based approach
- [examples/observable-usage-example.ts](./examples/observable-usage-example.ts) - Example usage of both approaches
