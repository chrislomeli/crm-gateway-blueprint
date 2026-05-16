# Error Handling Standards

## Standards (Enforce Now) 

These are **mandatory** for all new code and should be applied during code reviews:

### 1. Use Result Types for Public APIs
```typescript
// ✅ STRONGLY RECOMMENDED: All public functions must return Result<T>
export async function processFile(filePath: string): Promise<Result<ProcessedFile, FileError>> {
  // Implementation
}

// ❌ FORBIDDEN: Throwing exceptions across function boundaries
export async function processFile(filePath: string): Promise<ProcessedFile> {
  throw new Error('Something failed'); // Don't do this
}
```

### 2. Custom Error Classes
```typescript
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
```


### 4. Async/Await Error Handling
```typescript
// ✅ STRONGLY RECOMMENDED: Explicit error handling with Result pattern
try {
  const user = await getUser(id);
  return { success: true, data: user };
} catch (error) {
  logger.error('Failed to get user', { error, userId: id });
  return success(data);
}
```

## Logging Strategy

We use a custom logger designed specifically for structured logging in modern observability stacks. It includes:

* Timestamped, structured log messages
* Component-level scoping for better traceability
* File name and line number
* Log levels: `debug`, `info`, `warn`, `error`


### Use Logger Instead of Console
```typescript
// ✅ REQUIRED: Use the logger infrastructure
import { logger } from '@<project>/core';

logger.info('File processed successfully', { fileName, recordCount });
logger.error('Processing failed', { fileName, error: error.message });

// ❌ ONLY for visual troubleshooting: Direct console usage (except local development)
console.log('File processed'); // Don't do this in production code
```

### Structured Log Format
```typescript
// ✅ REQUIRED: Include relevant context in structured format
logger.info('Processing started', {
  fileName: 'data.csv',
  recordCount: 1500,
  processingMode: 'batch'
});

```

### Safe Input Context Guidelines
- ✅ **Include**: IDs, file paths, numeric values, enum values
- ✅ **Include**: Request metadata (size, format, count)
- ❌ **Never Include**: Passwords, API keys, tokens, PII
- ❌ **Avoid**: Large payloads, full response bodies

## Error Context Best Practices

```typescript
// ✅ SAFE: Include helpful debugging context
return failure(createError({
  message: 'Failed to process user data',
  context: {
    userId: user.id,
    fileName: 'users.csv',
    recordNumber: 42,
    validationErrors: ['email_invalid', 'age_missing']
  }
}));

// ❌ FORBIDDEN: Include sensitive data in error context
return failure(createError({
  context: {
    password: userPassword, // Never include passwords
    apiKey: config.apiKey,  // Never include API keys
    fullPayload: largeData  // Don't include large payloads
  }
}));
