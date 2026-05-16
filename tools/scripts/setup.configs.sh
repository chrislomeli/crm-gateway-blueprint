#!/bin/bash
# sync-configs-for-debug.sh
# Generates local config files from Kustomize-deployed resources for development
# Updated to match new structure with consolidated secrets

set -e

echo "📁 Generating local config files from K8s cluster..."
echo "   This creates the same file structure your pods see in K8s"
echo ""

# Create local config structure matching k8s.md mount paths
mkdir -p ./config/shared
mkdir -p ./config/webhook-subscriber
mkdir -p ./config/intent-subscriber


# Function to dump ConfigMap as YAML file (dynamic key detection)
dump_configmap() {
    local configmap_name=$1
    local output_dir=$2
    local namespace=${3:-default}

    echo "🔄 Dumping ConfigMap '$configmap_name' from cluster"

    # Create directory structure
    mkdir -p "$output_dir"

    # Check if kubectl is available and cluster is accessible
    if ! kubectl get configmap "$configmap_name" -n "$namespace" &>/dev/null; then
        echo "   ⚠️  ConfigMap '$configmap_name' not found in namespace '$namespace', skipping..."
        return
    fi

    # Get all keys from the ConfigMap and dump each one
    local keys=$(kubectl get configmap "$configmap_name" -n "$namespace" -o json | jq -r '.data | keys[]' 2>/dev/null)

    if [ -z "$keys" ]; then
        echo "   ⚠️  ConfigMap '$configmap_name' has no data"
        return
    fi

    # Dump each key as a separate file (filename-as-namespace pattern)
    for key in $keys; do
        kubectl get configmap "$configmap_name" -n "$namespace" -o json | \
            jq -r ".data[\"$key\"]" > "$output_dir/$key"
        echo "   ✓ Created $key ($(wc -l < "$output_dir/$key") lines)"
    done
}

# Function to dump Secret with YAML files (new structure)
# Function to dump Secret with YAML files (new structure)
dump_secret_yaml_files() {
    local secret_name=$1
    local output_dir=$2
    local namespace=${3:-default}

    echo "🔄 Dumping Secret '$secret_name' from cluster"

    # Create directory structure
    mkdir -p "$output_dir"

    # Check if kubectl is available and cluster is accessible
    if ! kubectl get secret "$secret_name" -n "$namespace" &>/dev/null; then
        echo "   ⚠️  Secret '$secret_name' not found in namespace '$namespace', skipping..."
        return
    fi

    # Get all keys from the secret
    local keys=$(kubectl get secret "$secret_name" -n "$namespace" -o json | jq -r '.data | keys[]' 2>/dev/null)

    if [ -z "$keys" ]; then
        echo "   ⚠️  Secret '$secret_name' has no data"
        return
    fi

    # Dump each key as a separate YAML file
    for key in $keys; do
        # FIX: Use jq instead of jsonpath for keys with dots
        kubectl get secret "$secret_name" -n "$namespace" -o json | \
            jq -r ".data[\"$key\"]" | \
            base64 -d > "$output_dir/$key"
        echo "   ✓ Created $key ($(wc -l < "$output_dir/$key") lines)"
    done
}

# Check if required tools are available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is required but not installed"
    echo "   This script dumps ACTUAL resources from a running K8s cluster"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed"
    echo "   Please install jq to parse JSON output"
    exit 1
fi

# Check if we can access the cluster
if ! kubectl cluster-info &>/dev/null; then
    echo "❌ Cannot access Kubernetes cluster"
    echo "   This script requires a running K8s cluster with deployed resources"
    echo "   Make sure kubectl is configured and cluster is accessible"
    exit 1
fi

echo "🔍 Checking namespace..."
NAMESPACE=${NAMESPACE:-default}
echo "   Using namespace: $NAMESPACE"
echo ""

# Dump ConfigMaps
echo "📋 Dumping ConfigMaps from cluster..."
dump_configmap "shared-config" "./config/shared" "$NAMESPACE"
dump_configmap "webhook-subscriber-config" "./config/webhook-subscriber" "$NAMESPACE"
dump_configmap "intent-subscriber-config" "./config/intent-subscriber" "$NAMESPACE"

# Optional: Add more ConfigMaps if they exist
dump_configmap "simple-publisher-config" "./config/simple-publisher" "$NAMESPACE"

echo ""
echo "🔐 Dumping Secrets from cluster..."
dump_secret_yaml_files "secrets" "./config/secrets" "$NAMESPACE"

# Create a summary file
echo ""
echo "📊 Creating configuration summary..."
cat > ./README-config.md << EOF
# Local Configuration Sync

This directory contains ConfigMaps and Secrets synced from K8s cluster to match exactly what pods see.

## New Structure (Kustomize-based)

### ConfigMaps (Filename-as-Namespace Pattern)
- \`config/shared/shared.yaml\` - Shared configuration across all services
- \`config/webhook-subscriber/webhook-subscriber.yaml\` - Webhook-subscriber specific configuration
- \`config/intent-subscriber/intent-subscriber.yaml\` - Intent-subscriber specific configuration
- \`config/simple-publisher/simple-publisher.yaml\` - HubSpot publisher specific configuration

### Secrets (Individual Files)
- \`config/secrets/calls-db.yaml\` - acme main database connection
- \`config/secrets/crm-db.yaml\` - Alternate database for testing
- \`config/secrets/opensearch.yaml\` - Opensearch configuration
- \`config/secrets/hubspot.yaml\` - HubSpot API configuration

## Mount Points in Pods
\`\`\`yaml
volumeMounts:
  - name: shared-config
    mountPath: /config/shared
  - name: webhook-config
    mountPath: /config/webhook-subscriber
  - name: intent-config
    mountPath: /config/intent-subscriber
  - name: secrets
    mountPath: /config/secrets
\`\`\`

## Reading in Application
\`\`\`javascript
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
\`\`\`

## Refresh
Run \`./sync-configs-for-debug.sh\` to refresh configurations from K8s cluster.

Generated: $(date)
Namespace: $NAMESPACE
EOF

echo ""
echo "✅ Config sync complete!"
echo ""
echo "📁 Local file structure:"
echo "   config/"
if [ -f "./config/shared/shared.yaml" ]; then
    echo "   ├── shared/"
    echo "   │   └── shared.yaml ($(wc -l < ./config/shared/shared.yaml) lines)"
fi
if [ -f "./config/webhook-subscriber/webhook-subscriber.yaml" ]; then
    echo "   ├── webhook-subscriber/"
    echo "   │   └── webhook-subscriber.yaml ($(wc -l < ./config/webhook-subscriber/webhook-subscriber.yaml) lines)"
fi
if [ -f "./config/intent-subscriber/intent-subscriber.yaml" ]; then
    echo "   ├── intent-subscriber/"
    echo "   │   └── intent-subscriber.yaml ($(wc -l < ./config/intent-subscriber/intent-subscriber.yaml) lines)"
fi
echo "   └── secrets/"
if [ -f "./config/secrets/calls-db.yaml" ]; then
    echo "       ├── calls-db.yaml ($(wc -l < ./config/secrets/calls-db.yaml) lines)"
fi
if [ -f "./config/secrets/crm-db.yaml" ]; then
    echo "       ├── crm-db.yaml ($(wc -l < ./config/secrets/crm-db.yaml) lines)"
fi
if [ -f "./config/secrets/opensearch.yaml" ]; then
    echo "       ├── opensearch.yaml ($(wc -l < ./config/secrets/opensearch.yaml) lines)"
fi
if [ -f "./config/secrets/hubspot.yaml" ]; then
    echo "       └── hubspot.yaml ($(wc -l < ./config/secrets/hubspot.yaml) lines)"
fi

echo ""
echo "💡 Your app can now read configs using filename-as-namespace pattern:"
echo "   - ./config/shared/shared.yaml - Shared configuration"
echo "   - ./config/webhook-subscriber/webhook-subscriber.yaml - Webhook-subscriber configuration"
echo "   - ./config/intent-subscriber/intent-subscriber.yaml - Intent-subscriber configuration"
echo "   - ./config/simple-publisher/simple-publisher.yaml - HubSpot publisher configuration"
echo "   - ./config/secrets/calls-db.yaml - acme main database connection"
echo "   - ./config/secrets/crm-db.yaml - Alternate database for testing"
echo "   - ./config/secrets/opensearch.yaml - Opensearch configuration"
echo "   - ./config/secrets/hubspot.yaml - HubSpot API configuration"
echo ""
echo "📝 See README-config.md for details"