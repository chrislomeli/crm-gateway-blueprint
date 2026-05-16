import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/simple-publisher.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    bundle: true,
    splitting: false,
    outDir: 'dist',
    target: 'node18',
    platform: 'node',

    // Bundle problematic CJS dependencies
    noExternal: [
        // Express ecosystem
        'express',
        'compression',
        'cors',
        'helmet',

        // Logging chain
        'pino',
        'pino-pretty',
        'sonic-boom',
        'thread-stream',
        'fast-redact',
        'on-exit-leak-free',
        'pino-abstract-transport',

        // Metrics
        'hot-shots',

        // Small utilities with CJS
        'uuid',
        'uuid4',
        'ulid',
        'axios',
        'ts-toolbelt'
    ],

    // Keep these external
    external: [
        // Workspace packages (use regex patterns for consistency)
        /^@platform\//,
        /^@service\//,
        /^@crm\//,

        // Large/Native/ESM-ready
        '@aws-sdk/client-sqs',
        '@hubspot/api-client',
        'dd-trace',

        // Pure ESM packages
        'zod',
        'p-limit',
        'dotenv',

        // Node built-ins
        'node:*',
        'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer', 'url',
        'http', 'https', 'net', 'child_process', 'worker_threads'
    ],

    esbuildOptions(options: Record<string, any>) {
        options.platform = 'node';
        options.packages = 'bundle';
        options.mainFields = ['module', 'main'];
        options.conditions = ['import', 'module', 'node', 'default'];
    }
});