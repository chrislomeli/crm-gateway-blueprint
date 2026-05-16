/**
 * Controllable Async Function for Resilience Validation
 * 
 * This class provides a simple, controllable async function that can simulate
 * various failure modes, delays, and behaviors to validate resilience patterns
 * like circuit breakers, retry logic, and rate limiting.
 * 
 * Key insight: Resilience patterns don't care what the underlying operation is -
 * they just need an async function that can succeed, fail, timeout, etc.
 * 
 * @module resilience/validation/controllable-function
 */

import { Result, success, failure, createError } from '@platform/core';
import { logger } from '@platform/core';

/**
 * Configuration for controllable behavior
 */
export interface ControllableBehavior {
  /** Delay before responding (simulates slow operations) */
  delay?: number;
  
  /** Probability of random failure (0.0 to 1.0) */
  failureRate?: number;
  
  /** Number of consecutive failures before succeeding */
  consecutiveFailures?: number;
  
  /** Whether to timeout (throw timeout error) */
  shouldTimeout?: boolean;
  
  /** Timeout duration in ms */
  timeoutAfter?: number;
}

/**
 * Controllable async function for testing resilience patterns
 */
export class ControllableAsyncFunction {
  private config: ControllableBehavior = {};
  private callCount = 0;
  private consecutiveFailureCount = 0;
  private name: string;

  constructor(name: string = 'test-function') {
    this.name = name;
  }

  /**
   * Execute the controllable async operation
   */
  async call(): Promise<Result<any>> {
    this.callCount++;
    const startTime = Date.now();
    
    logger.info({
      config: this.config,
      callNumber: this.callCount
    }, `📞 [${this.name}] Call #${this.callCount} starting`);

    try {
      // Simulate delay (real async work)
      if (this.config.delay && this.config.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.delay));
      }

      // Handle timeout simulation
      if (this.config.shouldTimeout && this.config.timeoutAfter) {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), this.config.timeoutAfter);
        });
      }

      // Handle consecutive failures
      if (this.consecutiveFailureCount < (this.config.consecutiveFailures || 0)) {
        this.consecutiveFailureCount++;
        const error = createError({
          message: `Controlled consecutive failure #${this.consecutiveFailureCount}`,
          type: 'ControlledFailure'
        });
        
        logger.warn(`❌ [${this.name}] Consecutive failure ${this.consecutiveFailureCount}/${this.config.consecutiveFailures}`);
        return failure(error);
      }

      // Handle random failure rate
      if (this.config.failureRate && Math.random() < this.config.failureRate) {
        const error = createError({
          message: `Controlled random failure (rate: ${this.config.failureRate})`,
          type: 'ControlledRandomFailure'
        });
        
        logger.warn(`🎲 [${this.name}] Random failure triggered`);
        return failure(error);
      }

      // Success case
      const duration = Date.now() - startTime;
      const result = {
        callNumber: this.callCount,
        timestamp: Date.now(),
        duration,
        message: `Success after ${duration}ms`
      };

      logger.info( {
        duration,
        result
      }, `✅ [${this.name}] Call #${this.callCount} succeeded`);

      return success(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error( {
        duration,
        error: error instanceof Error ? error.message : String(error)
      }, `💥 [${this.name}] Call #${this.callCount} threw exception`);
      
      throw error; // Let the resilience patterns handle this
    }
  }

  /**
   * Configure the behavior of this function
   */
  configure(behavior: ControllableBehavior): void {
    this.config = { ...behavior };
    this.consecutiveFailureCount = 0; // Reset consecutive failure counter
    
    logger.info( {
      behavior: this.config
    });
  }

  /**
   * Reset to normal behavior (no failures, no delays)
   */
  reset(): void {
    this.config = {};
    this.consecutiveFailureCount = 0;
    
    logger.info(`🔄 [${this.name}] Reset to normal behavior`);
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      totalCalls: this.callCount,
      currentConfig: this.config,
      consecutiveFailureCount: this.consecutiveFailureCount
    };
  }

  /**
   * Create a bound function that can be passed to observables
   */
  createBoundFunction(): () => Promise<Result<any>> {
    return () => this.call();
  }
}
