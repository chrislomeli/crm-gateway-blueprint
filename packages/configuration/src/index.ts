/**
 * Configuration Package - K8s-native configuration and secrets management
 * 
 * This package provides:
 * - ConfigMap-based configuration loading
 * - AWS Secrets Manager integration with caching
 * - Modern ssm://secret/field secret injection pattern
 * - JIT secret resolution with fallback sources
 */

// Main configuration provider (static interface)
export * from './config-provider';

// Barrel exports for all modules
export * from './config';
export * from './query';
export * from './secrets';

// Configuration constants and schema
export * from './config-keys';

// Configuration health check utilities
export * from './config-health-check';