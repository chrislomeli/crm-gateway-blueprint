/**
 * Tracing Utilities - Simple ULID generation for trace context
 * 
 * This module provides standardized ULID generation functions for trace context
 * across all Blueprint services. It keeps trace ID generation consistent while
 * allowing services to manage their own trace context as needed.
 * 
 * @module core/tracing
 */

import { ulid } from 'ulid';

/**
 * Generates a unique contact-level trace ID
 * 
 * Contact trace IDs are used to track all operations related to a specific
 * contact across multiple services and operations. This provides end-to-end
 * traceability for contact-related workflows.
 * 
 * @returns A ULID string for contact-level tracing
 */
export function generateContactTraceId(): string {
  return ulid();
}

/**
 * Generates a unique operation-level span ID
 * 
 * Operation span IDs are used to track individual operations within a larger
 * contact workflow. Multiple operations can share the same contact trace ID
 * but have different operation span IDs.
 * 
 * @returns A ULID string for operation-level tracing
 */
export function generateOperationSpanId(): string {
  return ulid();
}

/**
 * Generates a unique parent trace ID
 * 
 * Parent trace IDs are used to track the root of a distributed trace across
 * multiple services and systems. This is typically generated at the entry
 * point of a workflow (e.g., webhook, API request).
 * 
 * @returns A ULID string for parent-level tracing
 */
export function generateParentTraceId(): string {
  return ulid();
}

/**
 * Generates a unique event span ID
 * 
 * Event span IDs are used to track individual events within operations.
 * This provides fine-grained traceability for event processing workflows.
 * 
 * @returns A ULID string for event-level tracing
 */
export function generateEventSpanId(): string {
  return ulid();
}
