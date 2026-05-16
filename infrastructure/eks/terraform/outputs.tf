output "namespace" {
  description = "Kubernetes namespace"
  value       = var.namespace
}

output "eso_role_arn" {
  description = "IAM role ARN for ESO"
  value       = aws_iam_role.eso_role.arn
}

output "app_role_arn" {
  description = "IAM role ARN for applications"
  value       = aws_iam_role.app_role.arn
}

output "queue_urls" {
  description = "SQS Queue URLs"
  value = {
    webhook_single = aws_sqs_queue.webhook_single_queue.url
    webhook_import = aws_sqs_queue.webhook_import_queue.url
    intent         = aws_sqs_queue.intent_queue.url
  }
}

output "secret_arn" {
  description = "ARN of the calls-db secret"
  value       = aws_secretsmanager_secret.calls_db.arn
}

output "next_steps" {
  description = "Next steps to complete deployment"
  value = <<-EOT
    
    Infrastructure deployed! Next steps:
    
    1. Verify ESO is running:
       kubectl get pods -n external-secrets
    
    2. Check SecretStore status:
       kubectl get secretstore -n ${var.namespace} aws-secrets-manager
    
    3. Verify ExternalSecret synced:
       kubectl get externalsecret -n ${var.namespace} calls-db-credentials
    
    4. Deploy applications:
       kubectl apply -k k8s/overlays/sandbox/
    
    5. Check application pods:
       kubectl get pods -n ${var.namespace}
  EOT
}
