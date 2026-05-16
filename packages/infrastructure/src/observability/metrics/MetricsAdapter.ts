/**
 * Metrics Adapter
 * 
 * Adapts the MetricsService interface to the IMetricsProvider interface
 * This allows existing MetricsService implementations to be used with the ObservabilityFactory
 */

import { ICounter, IGauge, IHistogram, IMetricsProvider } from '../interfaces/IMetricsProvider';
import { MetricsService } from './MetricsService';
import { logger } from '@platform/core';

/**
 * Counter implementation that delegates to MetricsService
 */
class CounterAdapter implements ICounter {
  constructor(
    private metricsService: MetricsService,
    private name: string
  ) {}

  add(value: number = 1, labels?: Record<string, string>): void {
    this.metricsService.increment(this.name, value, labels);
  }
}

/**
 * Gauge implementation that delegates to MetricsService
 */
class GaugeAdapter implements IGauge {
  constructor(
    private metricsService: MetricsService,
    private name: string
  ) {}

  set(value: number, labels?: Record<string, string>): void {
    this.metricsService.gauge(this.name, value, labels);
  }

  add(value: number, labels?: Record<string, string>): void {
    // Since MetricsService doesn't have a direct add method for gauges,
    // we log a warning and use the set method instead
    logger.warn('MetricsService does not support gauge.add(), using gauge.set() instead');
    this.metricsService.gauge(this.name, value, labels);
  }
}

/**
 * Histogram implementation that delegates to MetricsService
 */
class HistogramAdapter implements IHistogram {
  constructor(
    private metricsService: MetricsService,
    private name: string
  ) {}

  record(value: number, labels?: Record<string, string>): void {
    this.metricsService.timing(this.name, value, labels);
  }
}

/**
 * Adapter that implements IMetricsProvider using a MetricsService
 */
export class MetricsAdapter implements IMetricsProvider {
  private counters: Map<string, ICounter> = new Map();
  private gauges: Map<string, IGauge> = new Map();
  private histograms: Map<string, IHistogram> = new Map();

  constructor(private metricsService: MetricsService) {}

  createCounter(name: string, description?: string): ICounter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new CounterAdapter(this.metricsService, name));
    }
    return this.counters.get(name)!;
  }

  createGauge(name: string, description?: string): IGauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new GaugeAdapter(this.metricsService, name));
    }
    return this.gauges.get(name)!;
  }

  createHistogram(name: string, description?: string, unit?: string): IHistogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new HistogramAdapter(this.metricsService, name));
    }
    return this.histograms.get(name)!;
  }

  async shutdown(): Promise<void> {
    // No explicit shutdown needed for basic MetricsService
    logger.debug('Shutting down metrics adapter');
    return Promise.resolve();
  }
}
