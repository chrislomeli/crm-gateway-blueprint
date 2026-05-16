# HTTP Client Connector

This module provides HTTP client connectors for making resilient HTTP requests to external APIs. The module offers two implementation patterns:

1. **Functional Pattern (Recommended)**: Uses the `createHttpClient` factory function that returns HTTP methods wrapped with ObservableFunction for resilience
2. **Class-based Pattern (Legacy)**: Uses the `HttpClient` class that extends the Observable base class

## Functional Pattern (Recommended)

The functional pattern aligns with the MySQL and Elasticsearch connectors, providing a consistent approach across all external system integrations.

### Usage

```typescript
import { createHttpClient, HttpClientConfig } from '@crm/connectors';
import { ApplicationContext } from '@crm/core';

// Create the HTTP client
const httpClient = createHttpClient(applicationContext, {
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
  circuitBreaker: true
});

// Use the HTTP client
async function fetchUserData(userId: string) {
  const result = await httpClient.get(`/users/${userId}`);
  
  if (result.success) {
    return result.data;
  } else {
    console.error('Error fetching user data:', result.error);
    throw result.error;
  }
}
```

### Features

- Circuit breaker pattern to prevent cascading failures
- Retry mechanisms with configurable backoff strategies
- Rate limiting to prevent overwhelming downstream services
- Distributed tracing integration with OpenTelemetry
- Metrics collection for operational visibility
- Standardized error handling using the Result pattern

## Class-based Pattern (Legacy)

The class-based pattern uses inheritance from the Observable base class to provide resilience features.

### Usage

```typescript
import { HttpClient } from '@crm/connectors';
import { ApplicationContext } from '@crm/core';

// Create the HTTP client
const httpClient = new HttpClient(applicationContext, 'https://api.example.com');

// Use the HTTP client
async function fetchUserData(userId: string) {
  const result = await httpClient.get(`/users/${userId}`);
  
  if (result.success) {
    return result.data;
  } else {
    console.error('Error fetching user data:', result.error);
    throw result.error;
  }
}
```

## Migration Guide

To migrate from the class-based pattern to the functional pattern:

1. Replace `new HttpClient(applicationContext, baseUrl)` with `createHttpClient(applicationContext, { baseUrl })`
2. The method signatures remain the same, so no changes are needed to the method calls
3. If you were using any Observable-specific methods, you'll need to adapt your code to use the functional equivalent

Example migration:

```typescript
// Before
this.httpClient = new HttpClient(applicationContext, this.config.apiUrl);
const response = await this.httpClient.get('/api/users');

// After
this.httpClient = createHttpClient(applicationContext, { baseUrl: this.config.apiUrl });
const response = await this.httpClient.get('/api/users');
```

## Configuration

The `HttpClientConfig` interface provides the following configuration options:

| Option | Type | Description |
|--------|------|-------------|
| baseUrl | string | The base URL for all requests |
| timeout | number | (Optional) Request timeout in milliseconds |
| headers | Record<string, string> | (Optional) Default headers to include in all requests |
| retries | number | (Optional) Number of retry attempts for failed requests |
| circuitBreaker | boolean | (Optional) Whether to enable the circuit breaker pattern |

## Error Handling

Both implementations use the Result pattern for error handling, returning a `Result<T>` object with either:

- `success: true` and `data: T` for successful responses
- `success: false` and `error: ErrorObject` for failed responses

This allows for consistent error handling across all connectors in the Blueprint system.
