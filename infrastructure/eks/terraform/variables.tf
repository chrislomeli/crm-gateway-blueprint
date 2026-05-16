variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace for deployment"
  type        = string
  default     = "sandbox"
}

variable "environment" {
  description = "Environment name (sandbox, dev, staging, prod)"
  type        = string
  default     = "sandbox"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    ManagedBy   = "terraform"
    Environment = "sandbox"
    Project     = "crm-integration"
  }
}

# Database configuration
variable "calls_db_config" {
  description = "Calls database configuration"
  type = object({
    host     = string
    port     = number
    database = string
    username = string
    password = string
  })
  sensitive = true
}

# Queue names
variable "queue_names" {
  description = "SQS queue names"
  type = object({
    webhook_single = string
    webhook_import = string
    intent         = string
  })
  default = {
    webhook_single = "hubspot-webhook-single-queue"
    webhook_import = "hubspot-webhook-import-queue"
    intent         = "hubspot-intent-queue"
  }
}
