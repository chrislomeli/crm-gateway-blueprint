# Create ExternalSecret for calls-db
resource "kubectl_manifest" "calls_db_external_secret" {
  yaml_body = yamlencode({
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "calls-db-credentials"
      namespace = var.namespace
    }
    spec = {
      refreshInterval = "1h"
      secretStoreRef = {
        name = "aws-secrets-manager"
        kind = "SecretStore"
      }
      target = {
        name           = "calls-db-secret"  # K8s secret name stays the same
        creationPolicy = "Owner"
        template = {
          type = "Opaque"
          metadata = {
            labels = {
              "managed-by" = "external-secrets"
              "purpose"    = "database-credentials"
            }
          }
          data = {
            # Now contains actual resolved values, not ssm:// references
            "calls-db.yaml" = <<-EOT
              host: {{ .host }}
              port: {{ .port }}
              username: {{ .user }}
              password: {{ .password }}
              database: {{ .database }}
            EOT
          }
        }
      }
      dataFrom = [
        {
          extract = {
            key = "dev-rds-default"  # Your existing secret name
          }
        }
      ]
    }
  })

  depends_on = [
    kubectl_manifest.secret_store
  ]
}