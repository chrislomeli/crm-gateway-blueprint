# Local Configuration Sync

This directory contains ConfigMaps and Secrets synced from K8s cluster to match exactly what pods see.

## New Structure (Kustomize-based)

### ConfigMaps (Filename-as-Namespace Pattern)
- `config/shared/shared.yaml` - Shared configuration across all services
- `config/webhook-subscriber/webhook-subscriber.yaml` - Webhook-subscriber specific configuration
- `config/intent-subscriber/intent-subscriber.yaml` - Intent-subscriber specific configuration
- `config/simple-publisher/simple-publisher.yaml` - HubSpot publisher specific configuration

### Secrets (Individual Files)
- `config/secrets/calls-db.yaml` - acme main database connection
- `config/secrets/crm-db.yaml` - Alternate database for testing
- `config/secrets/opensearch.yaml` - Opensearch configuration
- `config/secrets/hubspot.yaml` - HubSpot API configuration

## Mount Points in Pods
```yaml
volumeMounts:
  - name: shared-config
    mountPath: /config/shared
  - name: webhook-config
    mountPath: /config/webhook-subscriber
  - name: intent-config
    mountPath: /config/intent-subscriber
  - name: secrets
    mountPath: /config/secrets
```

## Reading in Application
```javascript
// Filename-as-namespace config loader pattern
const configs = {};
const configDirs = ['/config/shared', '/config/webhook-subscriber', '/config/intent-subscriber', '/config/simple-publisher'];

configDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const sectionName = path.basename(file, '.yaml'); // e.g., "webhook-subscriber"
      const content = yaml.load(fs.readFileSync(path.join(dir, file)));
      configs[sectionName] = content;
    });
  }
});

// Read individual secret files
const secrets = {};
const secretsDir = '/config/secrets';
if (fs.existsSync(secretsDir)) {
  const files = fs.readdirSync(secretsDir);
  files.forEach(file => {
    const secretName = path.basename(file, '.yaml'); // e.g., "calls-db"
    const content = yaml.load(fs.readFileSync(path.join(secretsDir, file)));
    secrets[secretName] = content;
  });
}

// Access configs: configs['webhook-subscriber'].retryEnabled
// Access secrets: secrets['calls-db'].host
```

## Refresh
Run `./sync-configs-for-debug.sh` to refresh configurations from K8s cluster.

Generated: Wed Sep  3 22:36:40 PDT 2025
Namespace: default
