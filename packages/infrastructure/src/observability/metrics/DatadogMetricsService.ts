/**
 * Datadog Metrics Service
 * 
 * Implements the MetricsService interface using Datadog's DogStatsD protocol.
 * Sends metrics to the Datadog agent via UDP on port 8125.
 * 
 * Features:
 * - Counters, gauges, histograms
 * - Tags support
 * - Circuit breaker event logging
 * - Automatic metric prefixing
 * 
 * @module observability/metrics/DatadogMetricsService
 */

import { MetricsService } from './MetricsService';
import { logger } from '@platform/core';
import * as dgram from 'dgram';

export interface DatadogConfig {
  /** Datadog agent host (default: datadog-agent.data-pipeline.svc.cluster.local) */
  host?: string;
  /** Datadog agent port (default: 8125) */
  port?: number;
  /** Metric prefix (default: crm) */
  prefix?: string;
  /** Global tags to add to all metrics */
  globalTags?: Record<string, string>;
  /** Enable debug logging */
  debug?: boolean;
}

export class DatadogMetricsService implements MetricsService {
  private client: dgram.Socket;
  private config: Required<DatadogConfig>;

  constructor(config: DatadogConfig = {}) {
    this.config = {
      host: config.host || 'datadog-agent.data-pipeline.svc.cluster.local',
      port: config.port || 8125,
      prefix: config.prefix || 'crm',
      globalTags: config.globalTags || {},
      debug: config.debug || false
    };

    this.client = dgram.createSocket('udp4');
    
    this.client.on('error', (err) => {
      logger.error({ error: err.message }, 'Datadog metrics client error');
    });

    if (this.config.debug) {
      logger.info({
        host: this.config.host,
        port: this.config.port,
        prefix: this.config.prefix
      }, 'Datadog metrics service initialized');
    }
  }

  /**
   * Increment a counter metric
   */
  increment(metricName: string, value = 1, tags: Record<string, string> = {}): void {
    const metric = `${this.config.prefix}.${metricName}:${value}|c${this.formatTags(tags)}`;
    this.send(metric);
    
    if (this.config.debug) {
      logger.debug({ metric: metricName, value, tags }, '📊 Datadog counter');
    }
  }

  /**
   * Set a gauge metric
   */
  gauge(metricName: string, value: number, tags: Record<string, string> = {}): void {
    const metric = `${this.config.prefix}.${metricName}:${value}|g${this.formatTags(tags)}`;
    this.send(metric);
    
    if (this.config.debug) {
      logger.debug({ metric: metricName, value, tags }, '📏 Datadog gauge');
    }
  }

  /**
   * Record a timing/histogram metric
   */
  timing(metricName: string, durationMs: number, tags: Record<string, string> = {}): void {
    const metric = `${this.config.prefix}.${metricName}:${durationMs}|ms${this.formatTags(tags)}`;
    this.send(metric);
    
    if (this.config.debug) {
      logger.debug({ metric: metricName, durationMs, tags }, '⏱️ Datadog timing');
    }
  }

  /**
   * Log circuit breaker events as both metrics and events
   */
  logCircuitBreaker(event: 'open' | 'halfOpen' | 'close' | 'failure'): void {
    // Increment counter for circuit breaker events
    this.increment('circuit_breaker.events', 1, { event });
    
    // Send as Datadog event for alerting/dashboards
    const eventPayload = this.formatEvent({
      title: `Circuit Breaker ${event.toUpperCase()}`,
      text: `Circuit breaker state changed to ${event}`,
      alertType: event === 'open' ? 'error' : event === 'close' ? 'success' : 'warning',
      tags: this.mergeTags({ event, component: 'circuit_breaker' })
    });
    
    this.send(eventPayload);
    
    if (this.config.debug) {
      logger.debug({ event }, '🔌 Datadog circuit breaker event');
    }
  }

  /**
   * Send custom histogram metric
   */
  histogram(metricName: string, value: number, tags: Record<string, string> = {}): void {
    const metric = `${this.config.prefix}.${metricName}:${value}|h${this.formatTags(tags)}`;
    this.send(metric);
    
    if (this.config.debug) {
      logger.debug({ metric: metricName, value, tags }, '📈 Datadog histogram');
    }
  }

  /**
   * Send distribution metric (for percentiles)
   */
  distribution(metricName: string, value: number, tags: Record<string, string> = {}): void {
    const metric = `${this.config.prefix}.${metricName}:${value}|d${this.formatTags(tags)}`;
    this.send(metric);
    
    if (this.config.debug) {
      logger.debug({ metric: metricName, value, tags }, '📊 Datadog distribution');
    }
  }

  /**
   * Format tags for DogStatsD protocol
   */
  private formatTags(tags: Record<string, string>): string {
    const allTags = this.mergeTags(tags);
    const tagArray = Object.entries(allTags).map(([key, value]) => `${key}:${value}`);
    return tagArray.length > 0 ? `|#${tagArray.join(',')}` : '';
  }

  /**
   * Merge provided tags with global tags
   */
  private mergeTags(tags: Record<string, string>): Record<string, string> {
    return { ...this.config.globalTags, ...tags };
  }

  /**
   * Format Datadog event
   */
  private formatEvent(event: {
    title: string;
    text: string;
    alertType: 'error' | 'warning' | 'info' | 'success';
    tags: Record<string, string>;
  }): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const tagString = Object.entries(event.tags).map(([k, v]) => `${k}:${v}`).join(',');
    
    return `_e{${event.title.length},${event.text.length}}:${event.title}|${event.text}|d:${timestamp}|t:${event.alertType}|#${tagString}`;
  }

  /**
   * Send metric to Datadog agent
   */
  private send(metric: string): void {
    try {
      const buffer = Buffer.from(metric);
      this.client.send(buffer, 0, buffer.length, this.config.port, this.config.host, (err) => {
        if (err && this.config.debug) {
          logger.error({ error: err.message, metric }, 'Failed to send metric to Datadog');
        }
      });
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        metric 
      }, 'Error sending metric to Datadog');
    }
  }

  /**
   * Close the UDP client
   */
  close(): void {
    this.client.close();
    if (this.config.debug) {
      logger.info({}, 'Datadog metrics service closed');
    }
  }
}
