# Complete ESO Setup - Access Existing AWS Secrets

## Prerequisites
- Existing AWS Secrets Manager secrets: `dev-rds-default`, `dev-aws-es`, `shared-crm`
- kubectl access to your EKS cluster
- AWS credentials (SSO or IAM)
- Helm installed

## Step 1: Install External Secrets Operator

```bash
# Add helm repo
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

# Install ESO
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace \
  --set installCRDs=true

# Verify ESO is running (wait ~30 seconds)
kubectl get pods -n external-secrets
# Should see 3 pods running
```

## Step 2: Create Namespace (if needed)

```bash
kubectl create namespace sandbox
```

## Step 3: Create AWS Credentials Secret

Create file `aws-creds.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: aws-credentials
  namespace: sandbox
stringData:
  access-key-id: YOUR_AWS_ACCESS_KEY_ID
  secret-access-key: YOUR_AWS_SECRET_ACCESS_KEY
  session-token: YOUR_AWS_SESSION_TOKEN  # From SSO
```

Apply it:
```bash
kubectl apply -f aws-creds.yaml
```

## Step 4: Create ESO Configuration

Create file `eso-config.yaml`:

```yaml
---
# SecretStore - tells ESO how to connect to AWS
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: sandbox
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-west-2  # CHANGE TO YOUR REGION
      auth:
        secretRef:
          accessKeyIDSecretRef:
            name: aws-credentials
            key: access-key-id
          secretAccessKeySecretRef:
            name: aws-credentials
            key: secret-access-key
          sessionTokenSecretRef:
            name: aws-credentials
            key: session-token

---
# ExternalSecret - tells ESO what to fetch and how to format it
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: shared-secrets
  namespace: sandbox
spec:
  refreshInterval: 5m  # Caches for 5 minutes
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: secrets  # Creates K8s secret named "secrets"
    creationPolicy: Owner
    template:
      type: Opaque
      data:
        # Your exact format with resolved values
        "calls-db.yaml": |
          host: {{ .rds.host }}
          port: {{ .rds.port }}
          user: {{ .rds.username }}
          password: {{ .rds.password }}
          database: calls
        
        "crm-db.yaml": |
          host: postgres
          port: 5432
          database: pipeline
          user: postgres
          password: postgres_password
        
        "opensearch.yaml": |
          accessKeyId: {{ .es.access_id }}
          accessKeySecret: {{ .es.access_secret }}
          esHost: https://es.acmeqa.com
          esRegion: us-west-1
          tenantIsolationLevel: tenant
        
        "hubspot.yaml": |
          hubspotClientId: {{ .hubspot.hubspot_client_id }}
          hubspotClientSecret: {{ .hubspot.hubspot_client_secret }}
          hubspotLoginUri: https://app.hubspot.com/oauth/authorize
          hubspotRedirectUri: https://app.acme.com/oauth/hubspot-signup.php
  
  # Fetch from your existing AWS secrets
  dataFrom:
    - extract:
        key: dev-rds-default  # Your existing secret
      rewrite:
        - regexp:
            source: "(.*)"
            target: "rds.$1"
    
    - extract:
        key: dev-aws-es  # Your existing secret
      rewrite:
        - regexp:
            source: "(.*)"
            target: "es.$1"
    
    - extract:
        key: shared-crm  # Your existing secret
      rewrite:
        - regexp:
            source: "(.*)"
            target: "hubspot.$1"
```

Apply it:
```bash
kubectl apply -f eso-config.yaml
```

## Step 5: Verify It's Working

```bash
# Check if ExternalSecret synced successfully
kubectl get externalsecret shared-secrets -n sandbox
# Should show STATUS: SecretSynced and READY: True

# Check if K8s secret was created
kubectl get secret secrets -n sandbox

# View the actual resolved values
kubectl get secret secrets -n sandbox -o jsonpath='{.data.calls-db\.yaml}' | base64 -d

# Should output actual values like:
# host: your-actual-rds-endpoint.amazonaws.com
# port: 3306
# user: antigone
# password: bustleworth123!
# database: calls
```

## Step 6: Deploy Your Apps

Your existing deployments that mount the `secrets` secret will now get resolved values instead of `ssm://` references. No changes needed to the deployment YAML.

## What You Get

- ESO fetches from AWS Secrets Manager every 5 minutes
- Creates/updates K8s secret named `secrets` with actual values
- Your apps read plain values from `/config/secrets/`
- No more `ssm://` references
- No AWS API calls from your pods

## Troubleshooting

```bash
# Check ESO logs
kubectl logs -n external-secrets deployment/external-secrets

# Check ExternalSecret details
kubectl describe externalsecret shared-secrets -n sandbox

# Force a refresh
kubectl annotate externalsecret shared-secrets -n sandbox force-sync=$(date +%s)
```

### Common Issues
- Wrong AWS region in SecretStore
- AWS credentials expired (SSO tokens expire frequently)
- Secret names don't match exactly in AWS
- Missing IAM permissions to read secrets

## Cleanup Test Setup

```bash
kubectl delete externalsecret shared-secrets -n sandbox
kubectl delete secretstore aws-secrets-manager -n sandbox
kubectl delete secret aws-credentials -n sandbox
```

## Next Steps

Once working with temporary credentials, set up IRSA (IAM Roles for Service Accounts) for production:
1. Create IAM role with permissions to read secrets
2. Annotate ESO service account with role ARN
3. Remove the aws-credentials secret
4. Update SecretStore auth to use jwt/serviceAccountRef

## Notes

- ESO caches secrets at the K8s level (no AWS API calls from pods)
- When AWS secrets update, ESO refreshes automatically based on `refreshInterval`
- Your ConfigProvider code can be simplified to just read values directly
- The `rewrite` sections namespace the secrets to avoid field name collisions