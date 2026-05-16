# Modern Result Pattern

This module provides a comprehensive system for handling operation results and errors in TypeScript applications. It implements the Result pattern for explicit error handling without exceptions.

## Key Features

- **Type-Safe Results**: Represent success and failure cases with proper TypeScript types
- **Error Context**: Include rich context with errors for better debugging and handling
- **Error Handlers**: Register handlers for specific error types
- **Utility Functions**: Helper functions for working with Results (map, chain, unwrap, etc.)
- **Safe Error Conversion**: Convert any caught error to a structured ResultError

## Basic Usage

### Creating Results

```typescript
import { success, failure, createError } from '../infrastructure/results';

// Create a success result
const successResult = success({ id: 123, name: 'Example' });

// Create a failure result
const failureResult = failure(createError({
  message: 'Something went wrong',
  type: 'ValidationError',
  statusCode: 400
}));
```

### Checking Results

```typescript
import { isSuccess, isFailure } from '../infrastructure/results';

function processResult(result) {
  if (isSuccess(result)) {
    // TypeScript knows result.data exists here
    console.log('Success:', result.data);
  } else {
    // TypeScript knows result.error exists here
    console.error('Error:', result.error.message);
  }
}
```

### Working with Results

```typescript
import { map, chain, unwrapOr } from '../infrastructure/results';

// Map a result's data
const mappedResult = map(userResult, user => user.name);

// Chain results together
const finalResult = chain(userResult, user => getUserPosts(user.id));

// Safely unwrap with a default value
const userName = unwrapOr(userResult, { name: 'Anonymous' }).name;
```

### Try/Catch Wrapper

```typescript
import { tryResult, tryResultAsync } from '../infrastructure/results';

// Wrap a synchronous function that might throw
const result = tryResult(
  () => JSON.parse(inputString),
  'ParseError',
  { operation: 'parseUserInput' }
);

// Wrap an async function that might throw
const asyncResult = await tryResultAsync(
  () => fetchUserData(userId),
  'FetchError',
  { operation: 'getUserProfile', request: { userId } }
);
```

### Error Handling

```typescript
import { registerHandler, handleError, Severity } from '../infrastructure/results';

// Register a handler for a specific error type
registerHandler('ValidationError', (error, context) => {
  // Send validation errors to analytics
  analytics.trackError(error.message, {
    type: error.type,
    fields: context?.data?.fields
  });
});

// Handle an error
handleError(error, {
  operation: 'createUser',
  severity: Severity.WARNING,
  data: { userId: 123 }
});
```

## Best Practices

1. **Use Result for Expected Failures**: Return Result<T> for operations that can fail in expected ways
2. **Include Context**: Always provide context with errors for better debugging
3. **Register Handlers**: Register handlers for specific error types rather than logging everywhere
4. **Chain Operations**: Use chain() to compose operations that return Results
5. **Avoid Exceptions**: Use tryResult() and tryResultAsync() to convert exceptions to Results

## Migration from Legacy Error Handling

When migrating from the legacy error handling system:

1. Replace `Result<T>` imports from the old location with imports from `results`
2. Replace `AppError` with `ResultError`
3. Use `toResultError()` instead of casting errors with `as Error`
4. Consider registering handlers for specific error types instead of logging
