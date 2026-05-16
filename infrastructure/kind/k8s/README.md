# Complete K8s Configuration (Kustomize)

This directory contains all infrastructure and application configurations using Kustomize.

## Structure


## Migration from Helm

### 1. Backup existing Helm deployments (optional)
```bash
helm list
helm get values acme-infrastructure > backup-infrastructure-values.yaml
helm get values shared-config > backup-shared-config-values.yaml
helm get values webhook-subscriber > backup-webhook-values.yaml

### 3. Deploy with Kustomize
```bash
# Deploy everything (infrastructure + apps)
kubectl apply -k overlays/local/

# Watch it come up
kubectl get pods -w

## Daily Operations

### Deploy everything
```bash
kubectl apply -k overlays/local/

### See what would be deployed
```bash
kubectl kustomize overlays/local/

### FILE: migration.sh
