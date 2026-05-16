/**
 * Retry Logic Validation Test
 * 
 * This test validates that retry logic actually works by using a
 * controllable function to simulate consecutive failures followed by success.
 * 
 * Expected behavior:
 * - Function fails N times consecutively
 * - Retry logic attempts N retries
 * - Function succeeds on final attempt
 * - Total attempts = initial + retries
 * 
 * @module resilience/validation/retry-validation
 */

// Simple controllable async function (reusing pattern from circuit breaker test)
class ControllableFunction {
  constructor(name = 'retry-test') {
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
    this.consecutiveFailures = 0; // Reset counter
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

// Simple retry wrapper
class SimpleRetryWrapper {
  constructor(name, options = {}) {
    this.name = name;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 100;
  }

  async callWithRetry(fn) {
    let attempt = 0;
    let lastError;

    while (attempt <= this.maxRetries) {
      try {
        if (attempt > 0) {
          console.log(`🔄 [${this.name}] Retry attempt ${attempt}/${this.maxRetries}`);
          // Add delay between retries
          if (this.retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          }
        } else {
          console.log(`🎯 [${this.name}] Initial attempt`);
        }

        const result = await fn();
        
        if (attempt > 0) {
          console.log(`✅ [${this.name}] Success on retry attempt ${attempt}!`);
        } else {
          console.log(`✅ [${this.name}] Success on initial attempt!`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt <= this.maxRetries) {
          console.log(`❌ [${this.name}] Attempt ${attempt} failed: ${error.message}`);
        } else {
          console.log(`💥 [${this.name}] All retry attempts exhausted. Final failure: ${error.message}`);
        }
      }
    }

    throw lastError;
  }

  getConfig() {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    };
  }
}

// Main retry validation test
async function runRetryValidation() {
  console.log('🧪 Retry Logic Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('retry-validation');
  const retryWrapper = new SimpleRetryWrapper('test-retry', {
    maxRetries: 3,
    retryDelay: 50  // Fast retries for testing
  });

  try {
    console.log('📋 Scenario 1: Test Successful Retry After 2 Failures');
    console.log('   Function will fail 2 times, then succeed on 3rd attempt...\n');
    
    // Configure for 2 consecutive failures
    testFunction.setConsecutiveFailures(2);
    
    const startTime = Date.now();
    const result = await retryWrapper.callWithRetry(() => testFunction.call());
    const totalTime = Date.now() - startTime;
    
    console.log(`   Result: ${JSON.stringify(result)}`);
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Expected: 1 initial + 2 retries = 3 total attempts\n`);

    console.log('📋 Scenario 2: Test Retry Exhaustion (All Attempts Fail)');
    console.log('   Function will fail 5 times (more than max retries)...\n');
    
    // Reset and configure for more failures than retries
    testFunction.reset();
    testFunction.setConsecutiveFailures(5); // More than maxRetries (3)
    
    try {
      await retryWrapper.callWithRetry(() => testFunction.call());
      console.log('   ❌ ERROR: Should have failed after exhausting retries!');
    } catch (error) {
      console.log(`   ✅ Correctly failed after exhausting retries: ${error.message}`);
    }

    console.log('\n📋 Scenario 3: Test Immediate Success (No Retries Needed)');
    console.log('   Function will succeed immediately...\n');
    
    // Reset to normal behavior
    testFunction.reset();
    
    const result3 = await retryWrapper.callWithRetry(() => testFunction.call());
    console.log(`   Result: ${JSON.stringify(result3)}`);
    console.log('   Expected: Success on first attempt, no retries\n');

    console.log('🎉 Retry Logic Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Scenario 1: Should see exactly 3 attempts (1 initial + 2 retries)');
    console.log('   • Scenario 2: Should see 4 attempts then give up (1 initial + 3 retries)');
    console.log('   • Scenario 3: Should see 1 attempt only (immediate success)');
    console.log('\n📈 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Retry Config:', retryWrapper.getConfig());

  } catch (error) {
    console.error('❌ Retry Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runRetryValidation()
    .then(() => {
      console.log('\n✅ Retry validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Retry validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleRetryWrapper, runRetryValidation };
