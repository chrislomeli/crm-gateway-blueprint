/**
 * Alert service types and interfaces
 * 
 * This module defines the interfaces and types for the alerting service
 * that can be used to send alerts for critical operations.
 */

import { Result } from '@platform/core';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

/**
 * Alert metadata
 */
export interface AlertMetadata {
    service: string;
    operation: string;
    resource?: string;
    errorType?: string;
    errorMessage?: string;
    [key: string]: any;
}

/**
 * Alert service interface
 */
export interface IAlertService {
    /**
     * Send an alert
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    sendAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<Result<void>>;

    /**
     * Send a critical alert for a failed operation
     * 
     * @param operation Operation name
     * @param resource Resource name (e.g., "MySQL", "Redis", "Elasticsearch")
     * @param error Error that occurred
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    sendCriticalOperationAlert(
        operation: string,
        resource: string,
        error: Error | any,
        metadata?: Record<string, any>
    ): Promise<Result<void>>;
}
