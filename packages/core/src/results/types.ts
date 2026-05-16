/**
 * Result Types - Core Type Definitions for Result Pattern
 *
 * This file defines the foundational types and interfaces for the Result pattern used throughout
 * Blueprint applications. It provides type-safe structures for representing success and failure outcomes,
 * rich error metadata, and utilities for error classification and propagation.
 *
 * Key features:
 * - Strongly typed Success and Failure result variants
 * - Rich ResultError interface with context, cause, stack, and error type
 * - Support for error severity, status codes, and custom error types
 * - AppErrorType enum for standardized error classification
 *
 * These types are essential for enabling robust, composable, and observable error handling
 * in all application and infrastructure code.
 *
 * @module framework/results/types
 */


export interface ErrorInfo {
  statusCode?: number;
  status?: number;
  message: string;
  name?: string;
  code?: string;
  [key: string]: any; // Allow any additional fields to pass through
}



// Import AppErrorType for backward compatibility
/**
 * Application error types enum using TypeScript's const assertion pattern
 * This provides type safety and autocompletion for error types
 */
export const AppErrorType = {
  BAD_REQUEST: 'BadRequest',
  UNAUTHORIZED: 'Unauthorized',
  NOT_FOUND: 'NotFound',
  CONFLICT: 'Conflict',
  RATE_LIMIT_EXCEEDED: 'RateLimitExceeded',
  INTERNAL: 'Internal',
  TIMEOUT: 'Timeout',
  UPSTREAM_ERROR: 'UpstreamError',
  // Add other error types as needed
  CONFIGURATION_ERROR: 'ConfigurationError',
  INITIALIZATION_ERROR: 'InitializationError',
  VALIDATION_ERROR: 'ValidationError',
  DATABASE_ERROR: 'DatabaseError',
  HTTP_ERROR: 'HttpError',
  INTERNAL_ERROR: 'InternalError',
  PERMISSION_DENIED: 'PermissionDenied',
  RATE_LIMIT_ERROR: 'RateLimitError',
  INVALID_MESSAGE_FORMAT: 'InvalidMessageFormat',
  DOWNLOAD_ERROR: 'DownloadError',
  // Business rule noop scenarios (not errors, but alternate flows)
  CONTACT_NOT_FOUND: 'ContactNotFound',
  OWNER_NOT_FOUND: 'OwnerNotFound',
  BUSINESS_RULE_SKIP: 'BusinessRuleSkip',
  INTENT_NOT_MATCHED: 'IntentNotMatched',
  AUTHENTICATION_ERROR: 'Authorization Error'
} as const;

// Type representing the values of the AppErrorType object
export type AppErrorType = typeof AppErrorType[keyof typeof AppErrorType];

/**
 * Error severity levels
 */
export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Error context with metadata about the error
 */
export interface ErrorContext {
  /** The operation that was being performed when the error occurred */
  operation: string;
  /** Additional contextual data related to the error */
  data?: Record<string, unknown>;
  /** Request information if available */
  request?: unknown;
  /** Severity level of the error */
  severity?: Severity;
  /** Error code for categorization */
  code?: string;
}

/**
 * Standard error structure with enhanced metadata
 */
export interface ResultError {
  /** Error message */
  message: string;
  /** Error name (for backward compatibility) */
  name?: string;
  /** Original error that caused this error */
  cause?: Error | unknown;
  /** Error type for categorization */
  type: AppErrorType | string;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Stack trace */
  stack?: string;
  /** retryable trace */
  retryable?: boolean;
  /** Contextual information about the error */
  context?: ErrorContext;
}

/**
 * Success result with data
 */
export interface Success<T> {
  /** Indicates if the operation was successful */
  success: true;
  /** The successful result data */
  data: T;
  /** Optional status code to distinguish types of success (e.g., 200 = action performed, 204 = noop) */
  statusCode?: number;
  /** Optional message for additional context */
  message?: string;
}

/**
 * Failure result with error information
 */
export interface Failure {

  /** Alias for ok (for backward compatibility) */
  success: false;

  /** Optional status code to distinguish types of success (e.g., 200 = action performed, 204 = noop) */
  statusCode?: number;
  
  /** Optional message for additional context */
  message?: string;

  /** The error that caused the failure */
  error: ResultError;
}

/**
 * Result type representing either a successful or failed operation
 */
export type Result<T> = Success<T> | Failure;
