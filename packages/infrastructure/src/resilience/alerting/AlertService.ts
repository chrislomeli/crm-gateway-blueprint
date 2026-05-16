/**
 * AlertService implementation
 * 
 * This module provides a default implementation of the IAlertService interface
 * that can be used to send alerts for critical operations.
 */

import { createError, failure, Result, success } from '@platform/core';
import { logger } from '@platform/core';
import { AlertSeverity, AlertMetadata, IAlertService } from './types';

/**
 * Alert service configuration
 */
export interface AlertServiceConfig {
    /**
     * Service name
     */
    serviceName: string;
    
    /**
     * Environment name (e.g., "production", "staging")
     */
    environment: string;
    
    /**
     * Whether to send alerts to Datadog
     */
    enableDatadog?: boolean;
    
    /**
     * Whether to send alerts to PagerDuty
     */
    enablePagerDuty?: boolean;
    
    /**
     * Whether to send alerts to Slack
     */
    enableSlack?: boolean;
    
    /**
     * Minimum severity level for sending alerts
     * Alerts with severity below this level will be logged but not sent
     */
    minimumSeverity?: AlertSeverity;
}

/**
 * Default implementation of the IAlertService interface
 */
export class AlertService implements IAlertService {
    private readonly config: Required<AlertServiceConfig>;
    
    constructor(config: AlertServiceConfig) {
        this.config = {
            ...config,
            enableDatadog: config.enableDatadog ?? true,
            enablePagerDuty: config.enablePagerDuty ?? (config.environment === 'production'),
            enableSlack: config.enableSlack ?? true,
            minimumSeverity: config.minimumSeverity ?? AlertSeverity.ERROR
        };
    }
    
    /**
     * Send an alert
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    public async sendAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<Result<void>> {
        try {
            // Skip alerts below minimum severity
            if (this.shouldSkipAlert(severity)) {
                logger.debug({ metadata, severity, title }, `Skipping alert with severity ${severity}: ${title}`);
                return success(undefined);
            }
            
            // Log the alert
            this.logAlert(severity, title, message, metadata);
            
            // Send to Datadog if enabled
            if (this.config.enableDatadog) {
                await this.sendToDatadog(severity, title, message, metadata);
            }
            
            // Send to PagerDuty if enabled and critical
            if (this.config.enablePagerDuty && severity === AlertSeverity.CRITICAL) {
                await this.sendToPagerDuty(title, message, metadata);
            }
            
            // Send to Slack if enabled
            if (this.config.enableSlack) {
                await this.sendToSlack(severity, title, message, metadata);
            }
            
            return success(undefined);
        } catch (error) {
            logger.error({
                error,
                title,
                message,
                metadata
            }, `Failed to send alert: ${error instanceof Error ? error.message : String(error)}`);
            
            return failure(createError({
                type: 'AlertingError',
                message: `Failed to send alert: ${error instanceof Error ? error.message : String(error)}`,
                statusCode: 500,
                cause: error instanceof Error ? error : new Error(String(error))
            }));
        }
    }
    
    /**
     * Send a critical alert for a failed operation
     * 
     * @param operation Operation name
     * @param resource Resource name (e.g., "MySQL", "Redis", "Elasticsearch")
     * @param error Error that occurred
     * @param metadata Additional metadata for the alert
     * @returns Result indicating success or failure
     */
    public async sendCriticalOperationAlert(
        operation: string,
        resource: string,
        error: Error | any,
        metadata: Record<string, any> = {}
    ): Promise<Result<void>> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
        
        return this.sendAlert(
            AlertSeverity.CRITICAL,
            `${resource} Operation Failed: ${operation}`,
            `Critical error in ${operation} operation on ${resource}: ${errorMessage}`,
            {
                service: this.config.serviceName,
                operation,
                resource,
                errorType,
                errorMessage,
                ...metadata
            }
        );
    }
    
    /**
     * Check if an alert should be skipped based on severity
     * 
     * @param severity Alert severity
     * @returns True if the alert should be skipped
     */
    private shouldSkipAlert(severity: AlertSeverity): boolean {
        const severityLevels = {
            [AlertSeverity.INFO]: 0,
            [AlertSeverity.WARNING]: 1,
            [AlertSeverity.ERROR]: 2,
            [AlertSeverity.CRITICAL]: 3
        };
        
        return severityLevels[severity] < severityLevels[this.config.minimumSeverity];
    }
    
    /**
     * Log an alert to the console
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private logAlert(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): void {
        switch (severity) {
            case AlertSeverity.INFO:
                logger.info(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.WARNING:
                logger.warn(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.ERROR:
                logger.error(metadata, `ALERT: ${title} - ${message}`);
                break;
            case AlertSeverity.CRITICAL:
                logger.error(metadata, `CRITICAL ALERT: ${title} - ${message}`);
                break;
        }
    }
    
    /**
     * Send an alert to Datadog
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToDatadog(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement Datadog integration
        // This would typically use the Datadog API or SDK to send events/alerts
        logger.debug({ severity, title, message, metadata }, 'Would send to Datadog:');
    }
    
    /**
     * Send an alert to PagerDuty
     * 
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToPagerDuty(
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement PagerDuty integration
        // This would typically use the PagerDuty API to create incidents
        logger.debug({ title, message, metadata }, 'Would send to PagerDuty:');
    }
    
    /**
     * Send an alert to Slack
     * 
     * @param severity Alert severity
     * @param title Alert title
     * @param message Alert message
     * @param metadata Additional metadata for the alert
     */
    private async sendToSlack(
        severity: AlertSeverity,
        title: string,
        message: string,
        metadata: AlertMetadata
    ): Promise<void> {
        // TODO: Implement Slack integration
        // This would typically use the Slack API to send messages
        logger.debug({ severity, title, message, metadata }, 'Would send to Slack:');
    }
}
