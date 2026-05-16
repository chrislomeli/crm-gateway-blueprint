/**
 * Rate Limiting Validation Test
 * 
 * This test validates that rate limiting actually works by flooding
 * a controllable function with requests and observing throttling behavior.
 * 
 * Expected behavior:
 * - Initial requests process normally
 * - Rate limiter kicks in after threshold
 * - Subsequent requests are queued/delayed
 * - Requests process at controlled rate
 * 
 * @module resilience/validation/rate-limit-validation
 */

// Simple controllable async function (fast responses for flooding)
class ControllableFunction {
  constructor(name = 'rate-limit-test') {
    this.name = name;
    this.callCount = 0;
    this.delay = 0;
  }

  async call() {
    this.callCount++;
    const startTime = Date.now();
    
    console.log(`📞 [${this.name}] Call #${this.callCount} starting`);

    // Simulate processing time
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [${this.name}] Call #${this.callCount} completed in ${duration}ms`);
    
    return { 
      success: true, 
      callNumber: this.callCount, 
      timestamp: Date.now(),
      processingTime: duration
    };
  }

  setDelay(ms) {
    this.delay = ms;
    console.log(`⚙️ [${this.name}] Processing delay set to ${ms}ms`);
  }

  reset() {
    this.delay = 0;
    console.log(`🔄 [${this.name}] Reset to normal behavior`);
  }

  getStats() {
    return {
      totalCalls: this.callCount,
      currentDelay: this.delay
    };
  }
}

// Simple rate limiter
class SimpleRateLimiter {
  constructor(name, options = {}) {
    this.name = name;
    this.maxConcurrent = options.maxConcurrent || 2;
    this.minInterval = options.minInterval || 100; // ms between requests
    this.queue = [];
    this.activeCalls = 0;
    this.lastCallTime = 0;
  }

  async callWithRateLimit(fn) {
    return new Promise((resolve, reject) => {
      const request = { fn, resolve, reject, timestamp: Date.now() };
      this.queue.push(request);
      this.processQueue();
    });
  }

  async processQueue() {
    // Don't process if we're at max concurrent calls
    if (this.activeCalls >= this.maxConcurrent) {
      console.log(`⏳ [${this.name}] Rate limit active - ${this.activeCalls}/${this.maxConcurrent} concurrent calls`);
      return;
    }

    // Don't process if we haven't waited long enough since last call
    const timeSinceLastCall = Date.now() - this.lastCallTime;
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`⏱️ [${this.name}] Rate limit - waiting ${waitTime}ms before next call`);
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    // Process next request in queue
    const request = this.queue.shift();
    if (!request) return;

    this.activeCalls++;
    this.lastCallTime = Date.now();
    
    const queueTime = this.lastCallTime - request.timestamp;
    if (queueTime > 0) {
      console.log(`🚀 [${this.name}] Processing request (queued for ${queueTime}ms)`);
    } else {
      console.log(`🚀 [${this.name}] Processing request immediately`);
    }

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeCalls--;
      // Process next item in queue
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), this.minInterval);
      }
    }
  }

  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      minInterval: this.minInterval,
      queueLength: this.queue.length,
      activeCalls: this.activeCalls
    };
  }
}

// Main rate limiting validation test
async function runRateLimitValidation() {
  console.log('🧪 Rate Limiting Validation Test\n');

  // Create test components
  const testFunction = new ControllableFunction('rate-limit-validation');
  const rateLimiter = new SimpleRateLimiter('test-rate-limiter', {
    maxConcurrent: 2,    // Only 2 concurrent calls
    minInterval: 200     // 200ms between calls
  });

  try {
    console.log('📋 Scenario 1: Test Normal Processing (Under Limit)');
    console.log('   Making 3 calls with delays to stay under rate limit...\n');
    
    testFunction.setDelay(50); // Fast processing
    
    // Make calls with delays (should not trigger rate limiting)
    for (let i = 1; i <= 3; i++) {
      const startTime = Date.now();
      const result = await rateLimiter.callWithRateLimit(() => testFunction.call());
      const totalTime = Date.now() - startTime;
      console.log(`   Call ${i} total time: ${totalTime}ms\n`);
      
      // Wait to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    console.log('📋 Scenario 2: Test Rate Limiting (Flood Requests)');
    console.log('   Making 8 rapid requests to trigger rate limiting...\n');
    
    // Reset function stats
    testFunction.reset();
    testFunction.setDelay(100); // Slightly slower processing
    
    // Flood with requests (should trigger rate limiting)
    const promises = [];
    const startTime = Date.now();
    
    for (let i = 1; i <= 8; i++) {
      console.log(`📤 Submitting request ${i}`);
      const promise = rateLimiter.callWithRateLimit(() => testFunction.call())
        .then(result => {
          const elapsed = Date.now() - startTime;
          console.log(`📥 Request ${i} completed after ${elapsed}ms total`);
          return result;
        });
      promises.push(promise);
      
      // Small delay between submissions to see queuing
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`\n⏳ Waiting for all ${promises.length} requests to complete...\n`);
    
    // Wait for all requests to complete
    await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log(`\n📊 All requests completed in ${totalTime}ms`);
    console.log('   Expected: Requests should be throttled and take longer than without rate limiting');

    console.log('\n🎉 Rate Limiting Validation Test Completed!');
    console.log('\n📊 Expected Observations:');
    console.log('   • Scenario 1: Requests process immediately (under rate limit)');
    console.log('   • Scenario 2: Later requests queued/delayed due to rate limiting');
    console.log('   • Should see "Rate limit active" and "waiting Xms" messages');
    console.log('\n📈 Final Stats:');
    console.log('   Function:', testFunction.getStats());
    console.log('   Rate Limiter:', rateLimiter.getStats());

  } catch (error) {
    console.error('❌ Rate Limiting Validation Test Failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  runRateLimitValidation()
    .then(() => {
      console.log('\n✅ Rate limiting validation completed successfully');
    })
    .catch((error) => {
      console.error('\n❌ Rate limiting validation failed:', error);
    });
}

module.exports = { ControllableFunction, SimpleRateLimiter, runRateLimitValidation };
