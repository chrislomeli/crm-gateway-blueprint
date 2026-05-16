# Cluster configuration
cluster_name = "your-eks-cluster-name"
aws_region   = "us-west-2"
namespace    = "sandbox"
environment  = "sandbox"

# Database configuration (update with your actual values)
calls_db_config = {
  host     = "your-rds-endpoint.amazonaws.com"
  port     = 3306
  database = "calls"
  username = "antigone"
  password = "bustleworth123!"  # Use environment variable in CI/CD: TF_VAR_calls_db_config
}

# Queue names
queue_names = {
  webhook_single = "sandbox-hubspot-webhook-single"
  webhook_import = "sandbox-hubspot-webhook-import"
  intent         = "sandbox-hubspot-intent"
}

# Tags
tags = {
  ManagedBy   = "terraform"
  Environment = "sandbox"
  Project     = "crm-integration"
  Owner       = "your-team"
}
