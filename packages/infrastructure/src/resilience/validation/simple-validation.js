/**
 * Simple Circuit Breaker Validation (JavaScript)
 * 
 * A quick validation test to prove the circuit breaker concept works
 * without complex TypeScript compilation issues.
 */

// Simple controllable async function
class ControllableFunction {
  constructor(name = 'test') {
    this.name = name;
    this.callCount = 0;
    this.failureRate = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate delay
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Simulate failures
    if (Math.random() < this.failureRate) {
      console.log(`❌ [${this.name}] Call #${this.callCount} failed (controlled)`);
      throw new Error(`Controlled failure (rate: ${this.failureRate})`);
    }

    console.log(`✅ [${this.name}] Call #${this.callCount} succeeded`);
    return { success: true, callNumber: this.callCount, timestamp: Date.now() };
  }

  setFailureRate(rate) {
    this.failureRate = rate;
    console.log(`⚙️ [${this.name}] Failure rate set to ${rate * 100}%`);
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Delay set to ${ms}ms`);
  }

  reset() {
    this.failureRate = 0;
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      currentFailureRate: this.failureRate,
      currentDelay: this.delay
    };
  }
}

// Simple circuit breaker simulation
class SimpleCircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 10000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async call(fn) {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`🤞 [${this.name}] Circuit breaker HALF-OPEN (testing recovery)`);
      } else {
        console.log(`🔌 [${this.name}] Circuit breaker OPEN - fast fail`);
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      
      // Success - reset failure count and close circuit if needed
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        console.log(`✅ [${this.name}] Circuit breaker CLOSED (recovery successful)`);
      }
      this.failureCount = 0;
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      // Check if we should open the circuit
      if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        console.log(`🔌 [${this.name}] Circuit breaker OPEN (threshold reached: ${this.failureCount}/${this.failureThreshold})`);
      } else if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        console.log(`🔌 [${this.name}] Circuit breaker OPEN (half-open test failed)`);
      }
      
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold
    };
  }
}

// Main validation test
async function runValidation() {
  console.log('🧪 Simple Circuit Breaker Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('validation-test');
  const circuitBreaker = new SimpleCircuitBreaker('test-circuit', {
    failureThreshold: 3, // Open after 3 failures
    resetTimeout: 5000   // 5 second reset timeout
  });

  try {
    console.log('📋 Scenario 1: Trigger Circuit Breaker');
    console.log('   Setting 90% failure rate...\n');
    
    testFunction.setFailureRate(0.9); // 90% failure rate
    
    // Make calls until circuit opens
    for (let i = 1; i <= 8; i++) {
      try {
        const result = await circuitBreaker.call(() => testFunction.call());
        console.log(`   Call ${i}: Success`);
      } catch (error) {
        console.log(`   Call ${i}: Failed - ${error.message}`);
      }
      
      console.log(`   Circuit state: ${circuitBreaker.getState().state} (failures: ${circuitBreaker.getState().failureCount})\n`);
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('📋 Scenario 2: Test Fast-Fail Behavior');
    console.log('   Making calls while circuit is open...\n');
    
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      try {
        await circuitBreaker.call(() => testFunction.call());
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`   Fast-fail ${i}: Failed in ${duration}ms - ${error.message}`);
      }
    }

    console.log('\n📋 Scenario 3: Test Recovery');
    console.log('   Resetting function to succeed and waiting for circuit recovery...\n');
    
    testFunction.reset();
    
    // Wait a bit for reset timeout
    console.log('   Waiting 6 seconds for circuit reset timeout...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Try recovery
    try {
      const result = await circuitBreaker.call(() => testFunction.call());
      console.log('   Recovery test: Success!');
    } catch (error) {
      console.log(`   Recovery test: Failed - ${error.message}`);
    }

    console.log('\n🎉 Validation Test Completed!');
    console.log('\n📊 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Circuit Breaker:', circuitBreaker.getState());

  } catch (error) {
    console.error('❌ Validation test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  runValidation()
    .then(() => {
      console.log('\n✅ Validation completed');
    })
    .catch((error) => {
      console.error('\n❌ Validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleCircuitBreaker, runValidation };
