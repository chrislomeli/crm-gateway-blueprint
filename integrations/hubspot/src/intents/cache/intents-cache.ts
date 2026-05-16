/**
 * Intent Cache for HubSpot webhook processing
 *
 * Stores business intent configurations in memory to avoid database lookups
 * during webhook event processing. Provides fast lookups with TTL-based refresh.
 */

import { getErrorInfo, logger } from '@platform/core';
import { ConfigProvider } from '@platform/configuration';
import {
  intentGetBusinessIntents
} from '../intent';
import {
  failureFromError,
  noop,
  Result,
  success,
} from '@platform/core';
import { sendCacheAlert } from '../utils';
import {Intent} from "../../types/intent.types";
import {CacheHitResult, HubspotUpdateEvent} from "../../types/webhook.types";

export class IntentsCache {
  private cache = new Map<number, Intent>();
  private healthyState = false;
  private lastInitialized = 0;
  private isRefreshing = false;

  // Configuration from ConfigProvider
  private get maxSize(): number {
    return Number(ConfigProvider.get('intent-subscriber.cacheInMemoryMaxSize', 1000));
  }

  private get ttlSeconds(): number {
    return Number(ConfigProvider.get('intent-subscriber.cacheTtlSeconds', 3600));
  }

  private get healthMaxAgeMinutes(): number {
    return Number(ConfigProvider.get('intent-subscriber.cacheHealthMaxAgeMinutes', 60));
  }

  /**
   * Initialize cache with intent configurations
   */
  initializeCache(intents: Intent[]): void {
    if (intents.length > this.maxSize) {
      const error = sendCacheAlert(
          `Intent cache size ${intents.length} exceeds maximum ${this.maxSize}`,
          'initialize-cache',
          {
            currentSize: intents.length,
            maxSize: this.maxSize,
          },
      );
      this.healthyState = false;
      throw error;
    }

    try {
      this.cache.clear();
      for (const intent of intents) {
        this.cache.set(Number(intent.portalId), intent);
      }

      this.healthyState = true;
      this.lastInitialized = Date.now();

      logger.debug({
        size: intents.length,
        maxSize: this.maxSize,
        ttlSeconds: this.ttlSeconds,
      }, 'Intent cache initialized');
    } catch (error: unknown) {
      this.healthyState = false;
      const errorInfo = getErrorInfo(error);
      const alertError = sendCacheAlert(
          'Failed to initialize intent cache',
          'initialize-cache',
          {
            intentCount: intents.length,
            error: errorInfo,
          },
          error instanceof Error ? error : new Error(errorInfo.message),
      );
      throw alertError;
    }
  }

  /**
   * Check if an update event matches any cached intent configurations
   */
  async cacheHit(updateEvent: HubspotUpdateEvent): Promise<Result<CacheHitResult>> {
    if (!updateEvent.propertyName) {
      return noop('Cache miss - no property name');
    }

    try {
      // Ensure cache is fresh
      await this.ensureCacheInitialized();

      if (!this.healthyState) {
        sendCacheAlert(
            'Attempted to use unhealthy cache',
            'cache-hit',
            { updateEvent, cacheSize: this.cache.size },
        );
        return noop('Cache unhealthy');
      }

      // Lookup intent by portal ID
      const intent = this.cache.get(Number(updateEvent.portalId));
      if (!intent) {
        return noop('Not a target intent');
      }

      return success({
        intent,
        updateEvent,
      });
    } catch (error) {
      const errorInfo = getErrorInfo(error);
      logger.error({
        error: errorInfo,
        updateEvent,
      }, 'Cache hit error');
      return failureFromError(error as Error);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    size: number;
    healthy: boolean;
    maxSize: number;
    ttlSeconds: number;
    lastInitialized: number;
    ageMinutes: number;
  }> {
    const ageMinutes = Math.round(
        (Date.now() - this.lastInitialized) / (1000 * 60),
    );
    const isStale = ageMinutes > this.healthMaxAgeMinutes;

    return {
      size: this.cache.size,
      healthy: this.healthyState && !isStale,
      maxSize: this.maxSize,
      ttlSeconds: this.ttlSeconds,
      lastInitialized: this.lastInitialized,
      ageMinutes,
    };
  }

  /**
   * Ensures cache is initialized and refreshes if TTL expired
   */
  private async ensureCacheInitialized(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastInitialized;
    const isExpired = cacheAge > (this.ttlSeconds * 1000);
    const isUninitialized = this.lastInitialized === 0;

    // Skip if cache is fresh or already refreshing
    if (!isUninitialized && !isExpired) {
      return;
    }

    if (this.isRefreshing) {
      logger.debug('Cache refresh already in progress');
      return;
    }

    try {
      this.isRefreshing = true;

      logger.debug({
        cacheAgeSeconds: Math.round(cacheAge / 1000),
        ttlSeconds: this.ttlSeconds,
      }, isUninitialized ? 'JIT cache initialization' : 'Cache TTL refresh');

      // Fetch fresh intents from database
      const intentsResult = await intentGetBusinessIntents();
      logger.debug({intentsResult}, '++ INTENTS CACHE LOOKUP RESULT ++');

      if (!intentsResult.success) {
        const errorInfo = getErrorInfo(intentsResult);
        const error = new Error(`Failed to fetch intents: ${errorInfo.message}`);
        sendCacheAlert(
            'Cache refresh failed - unable to fetch intents',
            'cache-refresh',
            {
              error: errorInfo,
              cacheAge: Math.round(cacheAge / 1000),
            },
            error
        );
        throw error;
      }

      this.initializeCache(intentsResult.data);

      logger.debug({
        intentCount: intentsResult.data.length,
        refreshType: isUninitialized ? 'initial' : 'ttl-refresh'
      }, 'Cache refresh completed');

    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      logger.error({
        error: errorInfo,
        isUninitialized
      }, 'Cache refresh failed');

      // Only mark unhealthy if this was initial load
      if (isUninitialized) {
        this.healthyState = false;
      }

      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Simple getters for testing
  get size(): number {
    return this.cache.size;
  }

  get healthy(): boolean {
    return this.healthyState;
  }
}