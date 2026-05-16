export interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'healthy' | 'unhealthy'; message?: string; details?: any }>;
}

export interface HealthMetrics {
  [key: string]: number | string | boolean;
}

export interface HealthCheckerOptions {
  serviceName?: string;
  version?: string;
  customChecks?: HealthCheck[];
  enableMetrics?: boolean;
  gracefulShutdownTimeoutMs?: number;
  // Graceful degradation options
  maxHealthCheckRetries?: number;
  healthCheckRetryDelayMs?: number;
  failureToleranceCount?: number;
  // R&D troubleshooting options
  forceShutdownEnabled?: boolean;
}
