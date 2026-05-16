/**
 * Resilient Cache with TTL
 * 
 * This module provides an file-generator implementation of a resilient cache with TTL-based
 * refresh that gracefully handles refresh failures by continuing to use stale data.
 */

import {ApplicationContext, Result, success, failure, createError, logger} from '@platform/core';
import { createObservableFunction } from '../templates';
import { AlertService, AlertSeverity } from '../alerting';

/**
 * Cache entry with timestamp
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Options for the resilient cache
 */
export interface ResilientCacheOptions {
  /**
   * TTL in milliseconds
   */
  ttlMs: number;
  
  /**
   * Maximum staleness in milliseconds
   */
  maxStalenessMs: number;
  
  /**
   * Whether to alert on stale data
   */
  alertOnStaleData?: boolean;
  
  /**
   * Cache name for logging and alerting
   */
  cacheName?: string;
}

/**
 * Base class for resilient cache implementations
 */
export abstract class ResilientCache<K, V> {
  protected readonly ttlMs: number;
  protected readonly maxStalenessMs: number;
  protected readonly alertOnStaleData: boolean;
  protected readonly cacheName: string;
  protected readonly context: ApplicationContext;
  protected readonly alertService: AlertService;
  
  /**
   * Create a new resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    options: ResilientCacheOptions
  ) {
    this.context = context;
    this.alertService = alertService;
    this.ttlMs = options.ttlMs;
    this.maxStalenessMs = options.maxStalenessMs;
    this.alertOnStaleData = options.alertOnStaleData ?? true;
    this.cacheName = options.cacheName ?? 'resilient';
  }
  
  /**
   * Get a value from the cache, refreshing if needed
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  public async get(key: K): Promise<Result<V>> {
    // Try to get from cache first
    const entry = await this.getFromCache(key);
    
    // If not in cache, load from data source
    if (!entry) {
      return this.loadFromSource(key);
    }
    
    // Check if entry is fresh
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // If entry is fresh, return it
    if (age < this.ttlMs) {
      return success(entry.value);
    }
    
    // If entry is stale but within max staleness, refresh in background
    if (age < this.maxStalenessMs) {
      // Start background refresh
      this.refreshCache(key).catch(error => {
        logger.error({
          message: `Background cache refresh failed for key: ${String(key)}`,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      
      // Return stale data
      return success(entry.value);
    }
    
    // Entry is too stale, try to refresh synchronously
    const refreshResult = await this.loadFromSource(key);
    
    // If refresh succeeded, return fresh data
    if (refreshResult.success) {
      return refreshResult;
    }
    
    // If refresh failed but we have stale data, use it
    const staleness = now - entry.timestamp;
    if (entry) {
        
        // Log warning about using stale data
        logger.warn({
          message: `Using stale cache data for key: ${key}`,
          staleness: `${Math.round(staleness / 1000)}s`,
          error: refreshResult.error
        });
        
        // Alert about stale data if configured
        if (this.alertOnStaleData) {
          await this.alertService.sendAlert(
            AlertSeverity.WARNING,
            `Using stale ${this.cacheName} cache data`,
            `Cache refresh failed for key: ${key}. Using data that is ${Math.round(staleness / 1000)}s old.`,
            {
              service: this.context.identity.appName,
              operation: 'cache.get',
              resource: this.cacheName,
              key: String(key),
              staleness: `${Math.round(staleness / 1000)}s`,
              errorType: refreshResult.error?.type,
              errorMessage: refreshResult.error?.message
            }
          );
        }
        
        // Return stale data with warning
        return success(entry.value);
    }
    
    // No data available
    return refreshResult;
  }
  
  /**
   * Refresh the cache for a key in the background
   * 
   * @param key Cache key
   */
  protected async refreshCache(key: K): Promise<void> {
    try {
      const result = await this.loadFromSource(key);
      if (!result.success) {
        logger.warn({
          message: `Failed to refresh cache for key: ${String(key)}`,
          error: result.error
        });
      }
    } catch (error) {
      logger.error({
        message: `Error refreshing cache for key: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected abstract loadFromSource(key: K): Promise<Result<V>>;
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected abstract getFromCache(key: K): Promise<CacheEntry<V> | undefined>;
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected abstract setInCache(key: K, value: V): Promise<void>;
}

/**
 * In-memory implementation of resilient cache
 */
export class InMemoryResilientCache<K, V> extends ResilientCache<K, V> {
  private cache = new Map<string, CacheEntry<V>>();
  private readonly dataLoader: (key: K) => Promise<Result<V>>;
  
  /**
   * Create a new in-memory resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param dataLoader Function to load data from source
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    dataLoader: (key: K) => Promise<Result<V>>,
    options: ResilientCacheOptions
  ) {
    super(context, alertService, options);
    this.dataLoader = dataLoader;
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected async loadFromSource(key: K): Promise<Result<V>> {
    try {
      const result = await this.dataLoader(key);
      if (result.success) {
        await this.setInCache(key, result.data);
      }
      return result;
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to load data for key: ${String(key)}`,
        cause: error instanceof Error ? error : new Error(String(error))
      }));
    }
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected async getFromCache(key: K): Promise<CacheEntry<V> | undefined> {
    const keyStr = String(key);
    return this.cache.get(keyStr);
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected async setInCache(key: K, value: V): Promise<void> {
    const keyStr = String(key);
    this.cache.set(keyStr, {
      value,
      timestamp: Date.now()
    });
  }
  
  /**
   * Clear the cache
   */
  public clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get the number of entries in the cache
   */
  public size(): number {
    return this.cache.size;
  }
}

/**
 * Redis implementation of resilient cache
 */
export class RedisTTLCache<K, V> extends ResilientCache<K, V> {
  private readonly redisClient: any; // Replace with actual Redis client type
  private readonly keyPrefix: string;
  private readonly dataLoader: (key: K) => Promise<Result<V>>;
  
  /**
   * Create a new Redis resilient cache
   * 
   * @param context Application context
   * @param alertService Alert service
   * @param redisClient Redis client
   * @param keyPrefix Prefix for Redis keys
   * @param dataLoader Function to load data from source
   * @param options Cache options
   */
  constructor(
    context: ApplicationContext,
    alertService: AlertService,
    redisClient: any, // Replace with actual Redis client type
    keyPrefix: string,
    dataLoader: (key: K) => Promise<Result<V>>,
    options: ResilientCacheOptions
  ) {
    super(context, alertService, options);
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
    this.dataLoader = dataLoader;
  }
  
  /**
   * Load a value from the data source
   * 
   * @param key Cache key
   * @returns Result with the value or error
   */
  protected async loadFromSource(key: K): Promise<Result<V>> {
    try {
      const result = await this.dataLoader(key);
      if (result.success) {
        await this.setInCache(key, result.data);
      }
      return result;
    } catch (error) {
      return failure(createError({
        type: 'CacheError',
        message: `Failed to load data for key: ${String(key)}`,
        cause: error instanceof Error ? error : new Error(String(error))
      }));
    }
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key Cache key
   * @returns Cache entry or undefined if not found
   */
  protected async getFromCache(key: K): Promise<CacheEntry<V> | undefined> {
    const redisKey = this.getRedisKey(key);
    
    try {
      const data = await this.redisClient.get(redisKey);
      if (!data) {
        return undefined;
      }
      
      const parsed = JSON.parse(data);
      return {
        value: parsed.value,
        timestamp: parsed.timestamp
      };
    } catch (error) {
      logger.error({
        message: `Error getting value from Redis cache: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key Cache key
   * @param value Value to cache
   */
  protected async setInCache(key: K, value: V): Promise<void> {
    const redisKey = this.getRedisKey(key);
    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now()
    };
    
    try {
      await this.redisClient.set(
        redisKey,
        JSON.stringify(entry),
        'EX',
        Math.ceil(this.maxStalenessMs / 1000)
      );
    } catch (error) {
      logger.error({
        message: `Error setting value in Redis cache: ${String(key)}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the Redis key for a cache key
   * 
   * @param key Cache key
   * @returns Redis key
   */
  private getRedisKey(key: K): string {
    return `${this.keyPrefix}:${String(key)}`;
  }
  
  /**
   * Clear the cache
   */
  public async clear(): Promise<void> {
    try {
      const keys = await this.redisClient.keys(`${this.keyPrefix}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      logger.error({
        message: 'Error clearing Redis cache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the number of entries in the cache
   */
  public async size(): Promise<number> {
    try {
      const keys = await this.redisClient.keys(`${this.keyPrefix}:*`);
      return keys.length;
    } catch (error) {
      logger.error({
        message: 'Error getting Redis cache size',
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
}
