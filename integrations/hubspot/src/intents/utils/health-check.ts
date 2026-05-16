/**
 * Universal Health Check System
 *
 * Provides standardized health checking that works in both ECS and EKS environments
 */

import { logger } from '@platform/core';
import {
  AlertCategory,
  sendResourceExhaustionAlert,
  sendWarningAlert,
} from './alerting';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  checks: Record<string, boolean>;
  metrics?: Record<string, number>;
}

export type HealthCheckFunction = () => Promise<boolean>;

export class UniversalHealthCheck {
  private checks: Map<string, HealthCheckFunction> = new Map();
  private readonly serviceName: string;
  private readonly memoryLimitMB: number;

  constructor(serviceName: string = 'webhook-subscriber') {
    this.serviceName = serviceName;
    this.memoryLimitMB = parseInt(process.env.MEMORY_LIMIT_MB || '512');

    // Register default system checks
    this.registerCheck('memory', () => this.checkMemoryUsage());
    this.registerCheck('process', () => this.checkProcessHealth());
  }

  /**
   * Register a health check function
   */
  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    this.checks.set(name, checkFn);
    logger.debug({ checkName: name }, 'Registered health check');
  }

  /**
   * Remove a health check
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    logger.debug({ checkName: name }, 'Unregistered health check');
  }

  /**
   * Run all health checks and return comprehensive status
   */
  async runHealthChecks(): Promise<HealthCheckResult> {
    const results: Record<string, boolean> = {};
    const metrics: Record<string, number> = {};

    // Get system metrics
    const memUsage = process.memoryUsage();
    metrics.memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    metrics.memoryLimitMB = this.memoryLimitMB;
    metrics.memoryUtilizationPercent = Math.round(
      (metrics.memoryUsageMB / this.memoryLimitMB) * 100,
    );
    metrics.uptimeSeconds = Math.round(process.uptime());

    // Run all registered checks
    for (const [name, checkFn] of this.checks) {
      try {
        const startTime = Date.now();
        results[name] = await checkFn();
        metrics[`${name}_check_duration_ms`] = Date.now() - startTime;

        if (!results[name]) {
          logger.warn({ checkName: name }, 'Health check failed');
        }
      } catch (error) {
        results[name] = false;
        metrics[`${name}_check_duration_ms`] = -1; // Indicate error

        sendWarningAlert(
          `Health check exception: ${name}`,
          {
            service: this.serviceName,
            component: 'health-check',
            operation: name,
            category: AlertCategory.CONFIGURATION_ERROR,
            metadata: {
              errorType: (error as Error).constructor.name,
              errorMessage: (error as Error).message,
            },
          },
          error as Error,
        );
      }
    }

    // Determine overall status
    const failedChecks = Object.entries(results).filter(
      ([_, passed]) => !passed,
    );
    const criticalChecks = ['memory', 'process']; // These are critical for service operation
    const hasCriticalFailures = failedChecks.some(([name]) =>
      criticalChecks.includes(name),
    );

    let status: 'healthy' | 'unhealthy' | 'degraded';
    if (hasCriticalFailures) {
      status = 'unhealthy';
    } else if (failedChecks.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      checks: results,
      metrics,
    };
  }

  /**
   * Check memory usage against limits
   */
  private async checkMemoryUsage(): Promise<boolean> {
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    const utilizationPercent = (memUsageMB / this.memoryLimitMB) * 100;

    // Alert at 80% memory usage
    if (utilizationPercent > 80 && utilizationPercent < 90) {
      sendResourceExhaustionAlert('memory', memUsageMB, this.memoryLimitMB);
      return false;
    }

    // Warning at 70%
    if (utilizationPercent > 70) {
      logger.warn({
        memoryUsageMB: Math.round(memUsageMB),
        memoryLimitMB: this.memoryLimitMB,
        utilizationPercent: Math.round(utilizationPercent),
      }, 'High memory usage detected');
    }

    return Promise.resolve(utilizationPercent < 90); // Fail health check at 90%
  }

  /**
   * Check basic process health
   */
  private async checkProcessHealth(): Promise<boolean> {
    try {
      // Check if process is responsive
      const startTime = Date.now();
      await new Promise((resolve) => setImmediate(resolve));
      const responseTime = Date.now() - startTime;

      // If event loop is blocked for more than 100ms, consider unhealthy
      return responseTime < 100;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get a simple boolean health status (for quick checks)
   */
  async isHealthy(): Promise<boolean> {
    const result = await this.runHealthChecks();
    return result.status === 'healthy';
  }

  /**
   * Monitor resource usage continuously (call periodically)
   */
  monitorResourceUsage(): void {
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    const utilizationPercent = (memUsageMB / this.memoryLimitMB) * 100;

    // Log metrics for monitoring systems
    logger.debug({
      memoryUsageMB: Math.round(memUsageMB),
      memoryLimitMB: this.memoryLimitMB,
      memoryUtilizationPercent: Math.round(utilizationPercent),
      uptimeSeconds: Math.round(process.uptime()),
      eventLoopDelay: this.measureEventLoopDelay(),
    }, 'Resource usage metrics');
  }

  /**
   * Measure event loop delay (simple approximation)
   */
  private measureEventLoopDelay(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      return delay;
    });
    return 0; // Placeholder - would need more sophisticated implementation for real-time measurement
  }
}
