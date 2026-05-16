/**
 * Configuration path constants - simple key-to-path mapping
 */

export const CONFIG = {
  // Special constants
  ALL_CONFIG: '',  // Empty string to get all configuration
  
  // Database connections
  CALLS_DB: 'calls-db',
  CALLS_DB_HOST: 'calls-db.host',
  CALLS_DB_PORT: 'calls-db.port',
  CALLS_DB_NAME: 'calls-db.dbname',
  CALLS_DB_USER: 'calls-db.username',
  CALLS_DB_PASSWORD: 'calls-db.password',

  CRM_DB: 'crm-db',
  CRM_DB_HOST: 'crm-db.host',
  CRM_DB_PORT: 'crm-db.port',
  CRM_DB_NAME: 'crm-db.database',
  CRM_DB_USER: 'crm-db.username',
  CRM_DB_PASSWORD: 'crm-db.password',

  // Legacy DATABASE constants (for backward compatibility)
  CALLS_CONNECTION: 'calls-db',
  CRM_CONNECTION: 'crm-db',

  // HubSpot/Intent subscriber
  HUBSPOT_DECISION_API: 'intent-subscriber.decisionUrl',
  HUBSPOT_INTENT_TTL_DAYS: 'intent-subscriber.intentTTLDays',
  HUBSPOT_CACHE_TYPE: 'intent-subscriber.cacheType',
  HUBSPOT_CACHE_TABLE: 'intent-subscriber.cacheTableName',
  HUBSPOT_CACHE_TTL: 'intent-subscriber.cacheTtlSeconds',
  HUBSPOT_CACHE_HEALTH_MAX_AGE: 'intent-subscriber.cacheHealthMaxAgeMinutes',
  HUBSPOT_CACHE_MEMORY_SIZE: 'intent-subscriber.cacheInMemoryMaxSize',
  HUBSPOT_CACHE_STALE_TTL: 'intent-subscriber.cacheTtlMaxStaleSeconds',
  HUBSPOT_CACHE_HEALTH_INTERVAL: 'intent-subscriber.cacheHealthCheckIntervalSeconds',

  // s3
  BATCH_S3_BUCKETS: 's3-buckets',
  BATCH_S3_EXPORT_BUCKET: 'exports-bucket',
  BATCH_S3_EXPORT_PREFIX: 'exports-prefix',

  // Datasets
  TENANTS_TABLE: 'datasets.tenants-table',
  CONTACTS_INDEX: 'shared.datasets.contacts.elasticsearch-index',
  TENANTS_INDEX: 'shared.datasets.tenants.elasticsearch-index',
  CAMPAIGNS_INDEX: 'shared.datasets.campaigns.elasticsearch-index',

  // SQS Queues (for health checks)
  HUBSPOT_SQS_QUEUES: 'shared.sqs.hubspot',
  HUBSPOT_SINGLE_QUEUE: 'shared.sqs.hubspot.singleQueueName',
  HUBSPOT_IMPORT_QUEUE: 'shared.sqs.hubspot.importQueueName',
  HUBSPOT_INTENT_QUEUE: 'shared.sqs.hubspot.intentQueueName',

  // LocalStack
  LOCALSTACK: 'shared.localstack',
  LOCALSTACK_ENDPOINT: 'shared.localstack.endpoint',
  LOCALSTACK_REGION: 'shared.localstack.region',
  LOCALSTACK_ACCESS_KEY: 'localstack.access_key',
  LOCALSTACK_SECRET_KEY: 'localstack.secret_key',

  // Elasticsearch
  // ELASTICSEARCH_ENDPOINT: 'shared.elasticsearch.endpoint',
  // ELASTICSEARCH_REGION: 'shared.elasticsearch.region',

  // OpenSearch
  OPENSEARCH_KEYS: 'opensearch',
  OPENSEARCH_CONFIGS: 'shared.opensearch',
  OPENSEARCH_ENDPOINT: 'shared.opensearch.esHost',
  OPENSEARCH_REGION: 'shared.opensearch.esRegion',
  OPENSEARCH_TENANT_ISOLATION: 'shared.opensearch.tenantIsolationLevel',

  OPENSEARCH_ACCESS_KEY: 'opensearch.accessKeyId',
  OPENSEARCH_SECRET_KEY: 'opensearch.accessKeySecret',

  // HubSpot API (from CRM secrets)
  HUBSPOT_CLIENT_INFO:  'hubspot',
  HUBSPOT_CLIENT_ID:      'hubspot.hubspotClientId',
  HUBSPOT_CLIENT_SECRET:  'hubspot.hubspotClientSecret',
  HUBSPOT_REDIRECT_URI:   'hubspot.hubspotRedirectUri',
  HUBSPOT_LOGIN_URI:      'hubspot.hubspotLoginUri',
  HUBSPOT_API_KEY: 'shared.hubspot.apiKey',
  HUBSPOT_BASE_URL: 'shared.hubspot.baseUrl',

  // Health Check Retry Configuration (R&D troubleshooting)
  HEALTH_CHECK_MAX_RETRIES: 'env.HEALTH_CHECK_MAX_RETRIES',
  HEALTH_CHECK_RETRY_INTERVAL_SECONDS: 'env.HEALTH_CHECK_RETRY_INTERVAL_SECONDS',
  HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED: 'env.HEALTH_CHECK_FORCE_SHUTDOWN_ENABLED',

  // Observability Configuration
  OBSERVABILITY_PROVIDER: 'env.OBSERVABILITY_PROVIDER',
  OBSERVABILITY_TRACING_ENABLED: 'env.OBSERVABILITY_TRACING_ENABLED',
  OBSERVABILITY_METRICS_ENABLED: 'env.OBSERVABILITY_METRICS_ENABLED',

  // Legacy/Common paths found in codebase
  LOG_LEVEL: 'log.level',
  BATCH_SERVER_PORT: 'batch.serverPort',
  SHARED_LOCALSTACK: 'shared.localstack',
  
  // Legacy HubSpot paths (for backward compatibility)
  HUBSPOT_CONFIG_LEGACY: 'shared-config.sqs.hubspot',
  HUBSPOT_WEBHOOK_SINGLE_QUEUE: 'shared.sqs.hubspot.webhookSingleQueueName',
  HUBSPOT_WEBHOOK_IMPORT_QUEUE: 'shared.sqs.hubspot.webhookImportQueueName',
  HUBSPOT_INTENT_QUEUE_NAME: 'shared.sqs.hubspot.intentQueueName',
  
  // SQS Configuration
  SQS_BATCH_SIZE: 'sqs.batchSize',
  SQS_VISIBILITY_TIMEOUT: 'sqs.visibilityTimeout',
  SQS_POLL_INTERVAL: 'sqs.pollInterval',
  SQS_GRACEFUL_SHUTDOWN_MS: 'sqs.gracefulShutdownMs',
  
  // Legacy paths
  LOCALSTACK_LEGACY: 'localstack',
  SHARED_SQS_HUBSPOT: 'shared.sqs.hubspot',
  ELASTICSEARCH_LEGACY: 'elasticsearch',
  HUBSPOT_LEGACY: 'hubspot',
  OPENSEARCH_LEGACY: 'opensearch',
} as const;

// Type safety enforcement - only allow defined config paths
export type ConfigKey = keyof typeof CONFIG;
export type ConfigPath = typeof CONFIG[ConfigKey];

// Union type of all valid configuration paths for strict type checking
export type ValidConfigPath = typeof CONFIG[keyof typeof CONFIG];

// Backward compatibility - Legacy DATABASE object
export const DATABASE = {
  CALLS_CONNECTION: CONFIG.CALLS_CONNECTION,
  CRM_CONNECTION: CONFIG.CRM_CONNECTION,
} as const;

// Usage example:
// ConfigProvider.get(CONFIG.HUBSPOT_DECISION_API)
// ConfigProvider.get(CONFIG.CALLS_DB_HOST)