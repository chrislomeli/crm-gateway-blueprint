/**
 * Critical Alerting Utility
 *
 * Provides structured alerting for critical system failures that require immediate attention.
 * Integrates with Datadog for alert routing to PagerDuty, Slack, etc.
 */

import { logger } from '@platform/core';

export enum AlertSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum AlertCategory {
  CACHE_FAILURE = 'cache_failure',
  DATABASE_FAILURE = 'database_failure',
  EXTERNAL_SERVICE_FAILURE = 'external_service_failure',
  CONFIGURATION_ERROR = 'configuration_error',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
}

export interface AlertContext {
  service: string;
  component: string;
  operation: string;
  severity: AlertSeverity;
  category: AlertCategory;
  metadata?: Record<string, unknown>;
  error?: Error;
  retryable?: boolean;
}

/**
 * Send critical alert and return the processed error
 * This function logs structured alerts that can be picked up by Datadog
 * and routed to PagerDuty, Slack, or other alerting systems
 */
export function sendCriticalAlert<T extends Error>(
  message: string,
  context: AlertContext,
  error?: T,
): T | Error {
  const alertPayload = {
    alert_type: 'critical_system_failure',
    alert_id: `${context.service}-${context.component}-${
      context.category
    }-${Date.now()}`,
    timestamp: new Date().toISOString(),
    service: context.service,
    component: context.component,
    operation: context.operation,
    severity: context.severity,
    category: context.category,
    message,
    retryable: context.retryable ?? false,
    metadata: context.metadata || {},
    error_details: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined,
    // Datadog alert routing tags
    dd_tags: [
      `service:${context.service}`,
      `component:${context.component}`,
      `severity:${context.severity}`,
      `category:${context.category}`,
      `alert_type:critical_system_failure`,
    ],
  };

  // Log with structured format for Datadog ingestion
  logger.error(alertPayload, 'CRITICAL_ALERT');

  // Also log for immediate visibility during development
  logger.error({
    service: context.service,
    component: context.component,
    severity: context.severity,
    category: context.category,
  }, `🚨 CRITICAL ALERT: ${message}`);

  // Return the original error or create a new one
  return error || new Error(message);
}

/**
 * Send warning alert for non-critical but important issues
 */
export function sendWarningAlert(
  message: string,
  context: Omit<AlertContext, 'severity'>,
  error?: Error,
): Error {
  return sendCriticalAlert(
    message,
    { ...context, severity: AlertSeverity.MEDIUM },
    error,
  );
}

/**
 * Cache-specific alert helper
 */
export function sendCacheAlert(
  message: string,
  operation: string,
  metadata?: Record<string, unknown>,
  error?: Error,
): Error {
  return sendCriticalAlert(
    message,
    {
      service: 'webhook-subscriber',
      component: 'intents-cache',
      operation,
      severity: AlertSeverity.CRITICAL,
      category: AlertCategory.CACHE_FAILURE,
      metadata,
      retryable: false,
    },
    error,
  );
}

/**
 * Resource exhaustion alert helper
 */
export function sendResourceExhaustionAlert(
  resourceType: 'memory' | 'cpu' | 'connections',
  currentValue: number,
  threshold: number,
): Error {
  return sendCriticalAlert(`Resource exhaustion detected: ${resourceType}`, {
    service: 'webhook-subscriber',
    component: 'container-resources',
    operation: 'resource-monitoring',
    severity: AlertSeverity.HIGH,
    category: AlertCategory.RESOURCE_EXHAUSTION,
    metadata: {
      resourceType,
      currentValue,
      threshold,
      utilizationPercent: (currentValue / threshold) * 100,
    },
  });
}
