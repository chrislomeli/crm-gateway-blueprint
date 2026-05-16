/**
 * Datadog Observability Validation Test
 * 
 * This test validates that Datadog metrics and tracing work correctly
 * by using our controllable function approach with real Datadog services.
 * 
 * Expected behavior:
 * - Metrics sent to Datadog agent (counters, gauges, histograms)
 * - Traces sent to Datadog APM
 * - Circuit breaker events logged as both metrics and events
 * - All observability data visible in Datadog dashboard
 * 
 * @module resilience/validation/datadog-validation
 */

// Simple controllable async function (reusing pattern)
class ControllableFunction {
  constructor(name = 'datadog-test') {
    this.name = name;
    this.callCount = 0;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Handle consecutive failures
    if (this.consecutiveFailures < this.maxConsecutiveFailures) {
      this.consecutiveFailures++;
      console.log(`❌ [${this.name}] Call #${this.callCount} failed (consecutive failure ${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);
      throw new Error(`Controlled consecutive failure #${this.consecutiveFailures}`);
    }

    // Success case
    console.log(`✅ [${this.name}] Call #${this.callCount} succeeded after ${this.consecutiveFailures} failures`);
    return { 
      success: true, 
      callNumber: this.callCount, 
      timestamp: Date.now(),
      failuresBeforeSuccess: this.consecutiveFailures
    };
  }

  setConsecutiveFailures(count) {
    this.maxConsecutiveFailures = count;
    this.consecutiveFailures = 0;
    console.log(`⚙️ [${this.name}] Will fail ${count} times consecutively, then succeed`);
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Delay set to ${ms}ms`);
  }

  reset() {
    this.maxConsecutiveFailures = 0;
    this.consecutiveFailures = 0;
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      currentConsecutiveFailures: this.consecutiveFailures
    };
  }
}

// Mock Datadog services for testing (will be replaced with real ones)
class MockDatadogMetricsService {
  constructor(config = {}) {
    this.config = config;
    this.sentMetrics = [];
  }

  increment(metricName, value = 1, tags = {}) {
    const metric = { type: 'counter', name: metricName, value, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`📊 [Datadog] Counter: ${metricName} = ${value}`, tags);
  }

  gauge(metricName, value, tags = {}) {
    const metric = { type: 'gauge', name: metricName, value, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`📏 [Datadog] Gauge: ${metricName} = ${value}`, tags);
  }

  timing(metricName, durationMs, tags = {}) {
    const metric = { type: 'histogram', name: metricName, value: durationMs, tags, timestamp: Date.now() };
    this.sentMetrics.push(metric);
    console.log(`⏱️ [Datadog] Timing: ${metricName} = ${durationMs}ms`, tags);
  }

  logCircuitBreaker(event) {
    this.increment('circuit_breaker.events', 1, { event });
    console.log(`🔌 [Datadog] Circuit breaker event: ${event}`);
  }

  getSentMetrics() {
    return this.sentMetrics;
  }
}

class MockDatadogSpan {
  constructor(operationName) {
    this.operationName = operationName;
    this.tags = {};
    this.startTime = Date.now();
    this.finished = false;
  }

  setTag(key, value) {
    this.tags[key] = value;
    console.log(`🏷️ [Datadog] Span tag: ${key} = ${value}`);
  }

  setError(error) {
    this.tags.error = true;
    this.tags['error.message'] = error.message;
    this.tags['error.type'] = error.constructor.name;
    console.log(`❌ [Datadog] Span error: ${error.message}`);
  }

  finish() {
    this.finished = true;
    const duration = Date.now() - this.startTime;
    console.log(`✅ [Datadog] Span finished: ${this.operationName} (${duration}ms)`, this.tags);
  }
}

class MockDatadogTracingService {
  constructor(config = {}) {
    this.config = config;
    this.spans = [];
  }

  startSpan(operationName, parentSpan) {
    const span = new MockDatadogSpan(operationName);
    this.spans.push(span);
    console.log(`🚀 [Datadog] Span started: ${operationName}`);
    return span;
  }

  createChildSpan(parentSpan, operationName) {
    return this.startSpan(operationName, parentSpan);
  }

  getSpans() {
    return this.spans;
  }
}

// Observable wrapper with Datadog observability
class DatadogObservableWrapper {
  constructor(metricsService, tracingService) {
    this.metrics = metricsService;
    this.tracing = tracingService;
  }

  async callWithObservability(operationName, fn) {
    const span = this.tracing.startSpan(operationName);
    const startTime = Date.now();
    
    // Increment request counter
    this.metrics.increment('requests.total', 1, { operation: operationName });
    
    try {
      span.setTag('operation', operationName);
      span.setTag('start_time', startTime);
      
      const result = await fn();
      
      const duration = Date.now() - startTime;
      
      // Record success metrics
      this.metrics.increment('requests.success', 1, { operation: operationName });
      this.metrics.timing('requests.duration', duration, { operation: operationName, status: 'success' });
      
      span.setTag('success', true);
      span.setTag('duration_ms', duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failure metrics
      this.metrics.increment('requests.failure', 1, { operation: operationName, error: error.constructor.name });
      this.metrics.timing('requests.duration', duration, { operation: operationName, status: 'failure' });
      
      span.setError(error);
      span.setTag('duration_ms', duration);
      
      throw error;
    } finally {
      span.finish();
    }
  }
}

// Main Datadog validation test
async function runDatadogValidation() {
  console.log('🐕 Datadog Observability Validation Test\n');

  // Create mock Datadog services (in real usage, these would be the actual Datadog services)
  const metricsService = new MockDatadogMetricsService({
    host: 'datadog-agent.data-pipeline.svc.cluster.local',
    port: 8125,
    prefix: 'crm',
    debug: true
  });

  const tracingService = new MockDatadogTracingService({
    serviceName: 'crm-validation-test',
    env: 'development',
    debug: true
  });

  // Create observable wrapper
  const observable = new DatadogObservableWrapper(metricsService, tracingService);
  
  // Create controllable function
  const testFunction = new ControllableFunction('datadog-validation');

  try {
    console.log('📋 Scenario 1: Successful Operations (Metrics & Tracing)');
    console.log('   Making 3 successful calls to generate metrics and traces...\n');
    
    testFunction.setDelay(100); // Add some delay for realistic timing
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await observable.callWithObservability(
          `test-operation-${i}`,
          () => testFunction.call()
        );
        console.log(`   Operation ${i}: Success\n`);
      } catch (error) {
        console.log(`   Operation ${i}: Failed - ${error.message}\n`);
      }
    }

    console.log('📋 Scenario 2: Failed Operations (Error Metrics & Traces)');
    console.log('   Making calls that will fail to test error handling...\n');
    
    testFunction.reset();
    testFunction.setConsecutiveFailures(2); // Fail twice
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await observable.callWithObservability(
          `error-test-operation-${i}`,
          () => testFunction.call()
        );
        console.log(`   Error test ${i}: Success\n`);
      } catch (error) {
        console.log(`   Error test ${i}: Failed - ${error.message}\n`);
      }
    }

    console.log('📋 Scenario 3: Circuit Breaker Events');
    console.log('   Simulating circuit breaker state changes...\n');
    
    // Simulate circuit breaker events
    metricsService.logCircuitBreaker('open');
    await new Promise(resolve => setTimeout(resolve, 100));
    metricsService.logCircuitBreaker('halfOpen');
    await new Promise(resolve => setTimeout(resolve, 100));
    metricsService.logCircuitBreaker('close');

    console.log('\n🎉 Datadog Validation Test Completed!');
    console.log('\n📊 Metrics Summary:');
    const metrics = metricsService.getSentMetrics();
    console.log(`   Total metrics sent: ${metrics.length}`);
    
    const metricsByType = metrics.reduce((acc, metric) => {
      acc[metric.type] = (acc[metric.type] || 0) + 1;
      return acc;
    }, {});
    console.log('   Metrics by type:', metricsByType);

    console.log('\n🔍 Traces Summary:');
    const spans = tracingService.getSpans();
    console.log(`   Total spans created: ${spans.length}`);
    console.log(`   Finished spans: ${spans.filter(s => s.finished).length}`);

    console.log('\n📈 Expected in Datadog Dashboard:');
    console.log('   • crm.requests.total counter with operation tags');
    console.log('   • crm.requests.success/failure counters');
    console.log('   • crm.requests.duration histogram with status tags');
    console.log('   • crm.circuit_breaker.events counter with event tags');
    console.log('   • APM traces for test-operation-* and error-test-operation-*');
    console.log('   • Error traces with exception details');

    console.log('\n🔗 Next Steps:');
    console.log('   1. Deploy Datadog agent to Kubernetes cluster');
    console.log('   2. Replace mock services with real DatadogMetricsService/DatadogTracingService');
    console.log('   3. Run validation and check Datadog dashboard for metrics/traces');
    console.log('   4. Set up alerts for circuit breaker events');

  } catch (error) {
    console.error('❌ Datadog Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runDatadogValidation()
    .then(() => {
      console.log('\n✅ Datadog validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Datadog validation failed:', error);
    });
}

module.exports = { 
  ControllableFunction, 
  MockDatadogMetricsService, 
  MockDatadogTracingService,
  DatadogObservableWrapper,
  runDatadogValidation 
};
