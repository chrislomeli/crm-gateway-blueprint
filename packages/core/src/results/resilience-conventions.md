# Result Pattern Conventions for Resilience Layer

This document defines how the observability wrapper (`createDatabaseObservable`) interprets `Result<T>` status codes and error types to make nuanced decisions about circuit breaker behavior, retry logic, and metrics.

## Success Status Codes

The resilience layer interprets success status codes as follows:

### 200 - Action Performed (Default)
- **Meaning**: Operation completed successfully with data returned
- **Circuit Breaker**: Counts as success, helps close circuit
- **Retry**: No retry needed
- **Metrics**: Normal success metric

### 204 - No Content / Noop
- **Meaning**: Operation completed successfully but no action was taken (e.g., contact already exists, no updates needed)
- **Circuit Breaker**: Counts as success, helps close circuit  
- **Retry**: No retry needed
- **Metrics**: Noop success metric (separate from normal success)

### 202 - Accepted / Async
- **Meaning**: Operation accepted for processing but not yet complete
- **Circuit Breaker**: Counts as success
- **Retry**: No retry needed
- **Metrics**: Async success metric

## Failure Error Types and Retry Behavior

The resilience layer uses `ResultError.type` and `ResultError.retryable` to determine retry behavior:

### Retryable Errors (Circuit Breaker: Count as Failure, Retry: Yes)
- `TIMEOUT` - Network or database timeout
- `UPSTREAM_ERROR` - External service error
- `DATABASE_ERROR` - Database connection issues
- `HTTP_ERROR` - HTTP 5xx errors
- `RATE_LIMIT_ERROR` - Rate limiting (with backoff)

### Non-Retryable Errors (Circuit Breaker: Don't Count, Retry: No)
- `BAD_REQUEST` - Invalid input data
- `UNAUTHORIZED` - Authentication failure
- `NOT_FOUND` - Resource doesn't exist
- `VALIDATION_ERROR` - Data validation failure
- `PERMISSION_DENIED` - Authorization failure

### Business Logic "Errors" (Circuit Breaker: Don't Count, Retry: No)
These are not actual errors but alternate business flows:
- `CONTACT_NOT_FOUND` - Contact doesn't exist (may be expected)
- `OWNER_NOT_FOUND` - Owner doesn't exist (may be expected)
- `BUSINESS_RULE_SKIP` - Business rule caused operation to be skipped
- `INTENT_NOT_MATCHED` - Intent filtering didn't match

## Implementation Examples

### Database Operations
```typescript
// Successful query with data
return success(queryData, 200);

// Successful query but no rows found (expected case)
return success([], 204, "No matching records found");

// Retryable database error
return failure(createError({
  message: "Connection timeout",
  type: "TIMEOUT",
  statusCode: 500,
  retryable: true
}));

// Non-retryable validation error
return failure(createError({
  message: "Invalid email format",
  type: "VALIDATION_ERROR", 
  statusCode: 400,
  retryable: false
}));
```

### HTTP Operations
```typescript
// Successful HTTP request
return success(responseData, 200);

// HTTP 404 (may or may not be retryable depending on context)
return failure(createError({
  message: "Resource not found",
  type: "NOT_FOUND",
  statusCode: 404,
  retryable: false
}));

// HTTP 503 Service Unavailable (retryable)
return failure(createError({
  message: "Service temporarily unavailable", 
  type: "UPSTREAM_ERROR",
  statusCode: 503,
  retryable: true
}));
```

### Business Logic Operations
```typescript
// Contact processing completed successfully
return success(processedContact, 200);

// Contact already processed (noop)
return success(existingContact, 204, "Contact already up to date");

// Contact not found (business logic, not system error)
return failure(createError({
  message: "Contact not found in CRM",
  type: "CONTACT_NOT_FOUND",
  statusCode: 404,
  retryable: false
}));
```

## Observability Wrapper Behavior

The `createDatabaseObservable` wrapper uses these conventions:

1. **Circuit Breaker Counting**:
   - Success (200, 204, 202): Count as success
   - Retryable errors: Count as failure
   - Non-retryable errors: Don't count (business logic)

2. **Retry Logic**:
   - Only retry if `error.retryable === true`
   - Use exponential backoff for rate limit errors
   - Respect max retry limits

3. **Metrics**:
   - Separate metrics for success types (200 vs 204)
   - Error metrics by error type
   - Business logic metrics separate from system errors

This approach provides the resilience layer with rich information to make intelligent decisions while keeping the Result pattern simple and consistent.
