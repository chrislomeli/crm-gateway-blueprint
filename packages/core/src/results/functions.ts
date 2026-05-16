/**
 * Result Functions - Success/Failure Utilities for Result Pattern
 *
 * This file provides a comprehensive set of utility functions for working with the Result pattern
 * in Blueprint applications. It includes helpers for constructing, unwrapping, and safely executing
 * functions that return Result types, ensuring robust and consistent error handling throughout the codebase.
 *
 * Key features:
 * - Create success and failure Results with rich error context
 * - Safely execute sync and async operations with try/catch wrappers
 * - Convert exceptions to standardized ResultError objects
 * - Provide utilities for unwrapping and handling Results
 * - Support for error context, severity, and error type tagging
 *
 * These functions are foundational for all application and infrastructure code using the Result pattern,
 * enabling reliable error propagation and composability.
 *
 * @module framework/results/functions
 */

import {Result, Success, Failure, ResultError, ErrorContext, Severity, ErrorInfo} from './types';

/**
 * Creates a successful result
 * 
 * @param data The data to include in the result
 * @param statusCode Optional status code (e.g., 200 for action performed, 204 for noop)
 * @param message Optional message for additional context
 * @returns A successful result
 */
export function success<T>(data: T, statusCode: number = 200, message?: string): Success<T> {
  return {
    success: true,
    data,
    statusCode,
    ...(message && { message })
  };
}

/**
 * Creates a successful noop result (like HTTP 204 No Content)
 *
 * @param message Optional message explaining why no action was taken
 * @returns A successful noop result
 */
export function noop<T>(message?: string): Success<T> {
  return success({} as T, 204, message);
}

/**
 * Creates a failed result with a ResultError
 * 
 * @param error The ResultError that occurred
 * @returns A failed result
 */
export function failure(error: ResultError): Failure {
  return {
    success: false,
    error
  };
}

/**
 * Creates a ResultError from various error types
 * 
 * @param options Error creation options
 * @returns A structured ResultError
 */
export function createError(options: {
  message: string;
  type?: string;
  cause?: unknown;
  statusCode?: number;
  context?: ErrorContext;
  stack?: string;
  name?: string;
  retryable?: boolean;
}): ResultError {
  const { message, type = 'UnknownError', cause, statusCode, context, stack, name, retryable } = options;
  
  // Extract stack trace from cause if it's an Error and no stack was provided
  let errorStack = stack;
  if (!errorStack && cause instanceof Error) {
    errorStack = cause.stack;
  }
  
  return {
    message,
    type,
    name: name || type, // Use name if provided, otherwise use type
    cause,
    statusCode,
    stack: errorStack,
    context,
    retryable
  };
}

/**
 * Safely converts any caught error to a ResultError
 * This eliminates the need for casting like (error as Error).message
 * 
 * @param error The caught error (could be any type)
 * @param type Optional error type
 * @param context Optional error context
 * @returns A structured ResultError
 */
export function toResultError(
  error: unknown, 
  type = 'UnknownError',
  context?: ErrorContext
): ResultError {
  // Handle Error objects
  if (error instanceof Error) {
    return createError({
      message: error.message,
      type,
      name: error.name || type,
      cause: error,
      context,
      stack: error.stack
    });
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return createError({
      message: error,
      type,
      context
    });
  }
  
  // Handle other types
  return createError({
    message: `Unknown error: ${String(error)}`,
    type,
    cause: error,
    context
  });
}

/**
 * Creates a failed result from any caught error
 * 
 * @param error The caught error (could be any type)
 * @param type Optional error type
 * @param context Optional error context
 * @returns A failed result
 */
export function failureFromCatch(
  error: unknown, 
  type = 'UnknownError',
  context?: ErrorContext
): Failure {
  return failure(toResultError(error, type, context));
}

/**
 * Creates a failed result from a standard Error
 * This function is provided for backward compatibility
 * 
 * @param error The error to convert
 * @param type Optional error type
 * @param context Optional error context
 * @param statusCode Optional HTTP status code
 * @returns A failed result
 */
export function failureFromError(
  error: Error,
  type = 'UnknownError',
  context?: ErrorContext,
  statusCode?: number
): Failure {
  return failure(
    createError({
      message: error.message,
      type,
      name: error.name || type,
      cause: error,
      context,
      stack: error.stack,
      statusCode
    })
  );
}

/**
 * Safely extracts error information from unknown error objects
 * 
 * This utility solves the common TypeScript issue where catch blocks receive 'unknown' types
 * but we need to access error properties like statusCode, message, etc. It provides a type-safe
 * way to extract common error properties without casting.
 * 
 * @param error The caught error (could be any type)
 * @returns Structured error information with safe property access
 */


export function getErrorInfo(error: unknown): ErrorInfo {
  // Handle null/undefined explicitly
  if (error == null) {
    return {
      message: String(error) // 'null' or 'undefined'
    };
  }

  // Handle non-objects (primitives)
  if (typeof error !== 'object') {
    return {
      message: String(error)
    };
  }

  // At this point, error is definitely an object
  // Create a base result with safe property extraction
  const result: Record<string, any> = {};

  try {
    // Safely attempt to spread the error object
    // This will fail for objects with circular references or non-enumerable properties
    const errorObj = error as Record<string, any>;

    // First, try to copy all enumerable properties
    for (const key in errorObj) {
      try {
        // Check if property is safe to access
        if (Object.prototype.hasOwnProperty.call(errorObj, key)) {
          const value = errorObj[key];
          // Skip functions and symbols to keep the result serializable
          if (typeof value !== 'function' && typeof value !== 'symbol') {
            result[key] = value;
          }
        }
      } catch (propError) {
        // Individual property access failed, skip it
        console.warn(`Failed to access property ${key}:`, propError);
      }
    }

    // Ensure critical fields are properly extracted and typed
    // Extract statusCode (prefer statusCode over status)
    const statusCode = extractNumber(errorObj.statusCode) || extractNumber(errorObj.status);
    if (statusCode !== undefined) {
      result.statusCode = statusCode;
    }

    // Extract status (prefer status over statusCode)
    const status = extractNumber(errorObj.status) || extractNumber(errorObj.statusCode);
    if (status !== undefined) {
      result.status = status;
    }

    // Extract message with multiple fallbacks
    result.message = extractString(errorObj.message) ||
        extractString(errorObj.msg) ||
        extractString(errorObj.error) ||
        extractString(errorObj.reason) ||
        extractString(errorObj.description) ||
        safeStringify(error);

    // Extract name
    const name = extractString(errorObj.name);
    if (name !== undefined) {
      result.name = name;
    }

    // Extract code (can be string or number)
    const code = extractString(errorObj.code) || extractString(errorObj.errorCode);
    if (code !== undefined) {
      result.code = code;
    }

    // Handle stack trace if it exists (useful for debugging)
    const stack = extractString(errorObj.stack);
    if (stack !== undefined) {
      result.stack = stack;
    }

  } catch (err) {
    // Catastrophic failure (e.g., accessing properties throws)
    // Fall back to the safest possible response
    console.error('Failed to process error object:', err);
    return {
      message: safeStringify(error),
      _processingError: String(err)
    };
  }

  // Ensure message is always present
  if (!result.message) {
    result.message = 'Unknown error';
  }

  return result as ErrorInfo;
}

// Helper function to safely extract numbers
function extractNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }
  return undefined;
}

// Helper function to safely extract strings
function extractString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value != null && typeof value.toString === 'function') {
    try {
      const str = value.toString();
      // Avoid [object Object] unless that's all we have
      if (str !== '[object Object]' || value.constructor === Object) {
        return str;
      }
    } catch {
      // toString() threw an error
    }
  }
  return undefined;
}

// Helper function to safely stringify any value
function safeStringify(value: unknown): string {
  try {
    // Try JSON.stringify first for objects
    if (typeof value === 'object' && value !== null) {
      // Use a replacer to handle circular references
      const seen = new WeakSet();
      return JSON.stringify(value, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular Reference]';
          }
          seen.add(val);
        }
        if (typeof val === 'function') {
          return `[Function: ${val.name || 'anonymous'}]`;
        }
        if (typeof val === 'symbol') {
          return val.toString();
        }
        return val;
      }, 2);
    }
    return String(value);
  } catch {
    // Even stringify failed, use the most basic conversion
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return 'Unknown error';
    }
  }
}



/**
 * Checks if a result is successful
 * 
 * @param result The result to check
 * @returns True if the result is successful
 */
export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.success === true;
}
export function isANoop<T>(result: Result<T>): result is Success<T> {
  return result.success === true && result.statusCode === 204;
}


/**
 * Checks if a result is a failure
 * 
 * @param result The result to check
 * @returns True if the result is a failure
 */
export function isFailure<T>(result: Result<T>): result is Failure {
  return result.success === false;
}

/**
 * Checks if a result is a successful noop
 * 
 * @param result The result to check
 * @returns True if the result is a successful noop
 */
export function isNoop<T>(result: Result<T>): boolean {
  return isSuccess(result) && result.statusCode === 204;
}

/**
 * Maps a successful result to a new result with transformed data
 * 
 * @param result The result to map
 * @param fn The function to apply to the data
 * @returns A new result with the transformed data
 */
export function map<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
  if (isSuccess(result)) {
    return success(fn(result.data));
  }
  return result;
}

/**
 * Chains results by passing the data from one result to a function that returns another result
 * 
 * @param result The initial result
 * @param fn The function to apply to the data
 * @returns The result of applying the function to the data
 */
export function chain<T, U>(result: Result<T>, fn: (data: T) => Result<U>): Result<U> {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Safely unwraps a result, returning the data or a default value
 * 
 * @param result The result to unwrap
 * @param defaultValue The default value to return if the result is a failure
 * @returns The data or the default value
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Safely attempts to execute a function and wraps the result
 * 
 * @param fn The function to execute
 * @param errorType The type of error if the function throws
 * @param context Optional error context
 * @returns A result containing the function's return value or a failure
 */
export function tryResult<T>(
  fn: () => T, 
  errorType = 'UnknownError',
  context?: ErrorContext
): Result<T> {
  try {
    return success(fn());
  } catch (error) {
    return failureFromCatch(error, errorType, context);
  }
}

/**
 * Safely attempts to execute an async function and wraps the result
 * 
 * @param fn The async function to execute
 * @param errorType The type of error if the function throws
 * @param context Optional error context
 * @returns A promise resolving to a result containing the function's return value or a failure
 */
export async function tryResultAsync<T>(
  fn: () => Promise<T>, 
  errorType = 'UnknownError',
  context?: ErrorContext
): Promise<Result<T>> {
  try {
    return success(await fn());
  } catch (error) {
    return failureFromCatch(error, errorType, context);
  }
}

/**
 * Converts a QueryResult from data services to a Result
 * 
 * This helper eliminates repetitive conversion code when working with database query results.
 * It handles the common pattern of checking QueryResult.success and converting to the appropriate
 * Result type with proper error handling.
 * 
 * @param queryResult The QueryResult from a database operation
 * @param dataExtractor Optional function to extract specific data from the query result
 * @returns A Result containing the extracted data or failure
 */
export function fromQueryResult<T, U = T>(
  queryResult: { success: boolean; error?: string; rows?: T; insertId?: number },
  dataExtractor?: (queryResult: { rows?: T; insertId?: number }) => U
): Result<U> {
  if (!queryResult.success) {
    return failure(createError({
      message: queryResult.error || 'Database operation failed',
      type: 'DatabaseError'
    }));
  }

  const data = dataExtractor 
    ? dataExtractor(queryResult)
    : (queryResult.rows || queryResult.insertId) as unknown as U;

  return success(data);
}

/**
 * Creates a serializable error object for logging purposes
 * 
 * This utility solves the common issue where Error objects don't serialize properly
 * in logging contexts (showing up as empty objects {}). It extracts all relevant
 * error information into a plain object that can be safely logged.
 * 
 * @param error The error to serialize (could be any type)
 * @param context Optional additional context to include
 * @returns A plain object with error details that serializes properly
 */
export function serializeErrorForLogging(error: unknown, context?: Record<string, any>): Record<string, any> {
  const errorInfo = getErrorInfo(error);
  
  const serialized: Record<string, any> = {
    message: errorInfo.message,
    ...(errorInfo.name && { name: errorInfo.name }),
    ...(errorInfo.code && { code: errorInfo.code }),
    ...(errorInfo.statusCode && { statusCode: errorInfo.statusCode }),
    ...(errorInfo.status && { status: errorInfo.status })
  };

  // Add stack trace if available
  if (error instanceof Error && error.stack) {
    serialized.stack = error.stack;
  }

  // Add any additional context
  if (context) {
    serialized.context = context;
  }

  // If the original error has additional properties, try to capture them
  if (error && typeof error === 'object') {
    const err = error as any;
    // Common additional properties that might be useful
    const additionalProps = ['details', 'data', 'response', 'request', 'config'];
    for (const prop of additionalProps) {
      if (err[prop] !== undefined) {
        try {
          // Only add if it can be serialized
          JSON.stringify(err[prop]);
          serialized[prop] = err[prop];
        } catch {
          // Skip properties that can't be serialized
          serialized[prop] = `[Non-serializable ${typeof err[prop]}]`;
        }
      }
    }
  }

  return serialized;
}
