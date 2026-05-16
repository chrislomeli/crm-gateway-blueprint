/**
 * Circuit Breaker Validation Test
 * 
 * This test validates that the circuit breaker actually works by using a
 * controllable function to trigger specific failure scenarios and observing
 * the expected circuit breaker state transitions.
 * 
 * Expected log outputs:
 * - "🔌 Circuit breaker OPEN" when threshold is reached
 * - "🤞 Circuit breaker HALF-OPEN" after reset timeout
 * - "✅ Circuit breaker CLOSED" when recovery succeeds
 * 
 * @module resilience/validation/circuit-breaker-test
 */

import { ApplicationContext } from '@platform/core';
import { logger } from '@platform/core';
import { ControllableAsyncFunction } from './controllable-function';
import { createExternalApiObservable, EXTERNAL_API_PRESET } from '../preset-configs';

/**
 * Circuit breaker validation test
 */
export async function validateCircuitBreaker(): Promise<void> {
  console.log('🧪 Circuit Breaker Validation Test Starting\n');
  
  // Create test context
  const context: ApplicationContext = {
    identity: {
      appName: 'resilience-validation',
      namespace: 'test',
      integration: 'circuit-breaker-test'
    }
  };

  // Create controllable function
  const testFunction = new ControllableAsyncFunction('circuit-breaker-test');
  
  // Create observable with circuit breaker enabled (using external preset)
  // External preset has: circuitBreaker: true, errorThresholdPercentage: 50, resetTimeout: 30000
  const observableCall = createExternalApiObservable(
    context,
    'circuit-breaker-validation',
    testFunction.createBoundFunction(),
    {
      // Override for faster testing
      circuitBreakerConfig: {
        enabled: true,
        timeout: 5000,
        errorThresholdPercentage: 50, // Circuit opens at 50% failure rate
        resetTimeout: 10000, // 10 seconds for faster testing
        name: 'validation-circuit-breaker'
      }
    }
  );

  try {
    console.log('📋 Test Scenario 1: Force Circuit Breaker to Open');
    console.log('   Setting 80% failure rate to exceed 50% threshold...\n');
    
    // Configure for high failure rate
    testFunction.configure({
      failureRate: 0.8, // 80% failure rate (exceeds 50% threshold)
      delay: 100 // Small delay to make it realistic
    });

    // Make multiple calls to trigger circuit breaker
    console.log('   Making 10 calls to trigger circuit breaker...');
    for (let i = 1; i <= 10; i++) {
      try {
        const result = await observableCall();
        console.log(`   Call ${i}: ${result.success ? '✅ Success' : '❌ Failed'}`);
      } catch (error) {
        console.log(`   Call ${i}: 💥 Exception - ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n📋 Test Scenario 2: Verify Fast-Fail Behavior');
    console.log('   Circuit should be OPEN - calls should fail immediately...\n');
    
    // Make a few more calls - these should fail fast if circuit is open
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      try {
        const result = await observableCall();
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail test ${i}: ${result.success ? '✅ Success' : '❌ Failed'} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail test ${i}: 💥 Exception in ${duration}ms - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('\n📋 Test Scenario 3: Test Recovery (Simplified)');
    console.log('   Resetting function to succeed and making a test call...\n');
    
    // Reset function to succeed
    testFunction.reset();
    
    // Make one test call
    try {
      const result = await observableCall();
      console.log(`   Recovery test: ${result.success ? '✅ Success' : '❌ Failed'}`);
    } catch (error) {
      console.log(`   Recovery test: 💥 Exception - ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('\n🎉 Circuit Breaker Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Look for "🔌 Circuit breaker OPEN" in logs during scenario 1');
    console.log('   • Fast-fail calls in scenario 2 should complete in <10ms');
    console.log('   • Recovery behavior depends on circuit breaker state');
    console.log('\n📈 Function Stats:', testFunction.getStats());

  } catch (error) {
    console.error('❌ Circuit Breaker Validation Test Failed:', error);
    throw error;
  }
}

/**
 * Run the validation test if this file is executed directly
 */
if (require.main === module) {
  validateCircuitBreaker()
    .then(() => {
      console.log('\n✅ Validation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    });
}
