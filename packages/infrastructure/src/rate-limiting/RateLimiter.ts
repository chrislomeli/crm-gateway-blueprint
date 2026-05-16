import Bottleneck from 'bottleneck';
import Redis from 'ioredis';
import { logger } from '@platform/core';

export interface RateLimiterOptions {
    id: string;
    maxConcurrent: number;
    minTime: number;
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
    disabled?: boolean; // Use local limiter if Redis is unavailable
}

export interface RateLimiterWithFallback {
    client?: Redis;
    limiter: Bottleneck;
    isFallback: boolean;
}

type LogFn = {
    (msg: string, ctx?: Record<string, any>): void;
    (ctx: Record<string, any>, msg?: string): void;
};

export interface Logger {
    info: LogFn;
    warn: LogFn;
    error: LogFn;
    debug: LogFn;
    flush: () => void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiterWithFallback {
    const { datastore, client } = getRateLimiterDataStore(options);

    logger.debug({
        id: options.id,
        maxConcurrent: options.maxConcurrent,
        minTime: options.minTime,
    }, 'Creating Bottleneck limiter');

    const limiter = new Bottleneck({
        id: options.id,
        maxConcurrent: options.maxConcurrent,
        minTime: options.minTime,
        datastore,
        client,
    });

    return {
        client,
        limiter,
        isFallback: datastore !== 'ioredis' || !client,
    };
}

export function getRateLimiterDataStore(options: RateLimiterOptions): {
    datastore?: 'ioredis';
    client?: Redis;
} {
    const { redisHost, redisPort, redisPassword } = options;

    if (!redisHost || !redisPort) {
        logger.warn( {
            options,
        }, 'RateLimiter: Redis config not provided, falling back to in-memory');
        return {};
    }

    const redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        lazyConnect: true,
    });

    redis.on('error', (err) => {
        logger.error({ err }, 'Redis error in rate limiter');
    });

    return {
        datastore: 'ioredis',
        client: redis,
    };
}
