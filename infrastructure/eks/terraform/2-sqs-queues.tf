# SQS Dead Letter Queues
resource "aws_sqs_queue" "webhook_single_dlq" {
  name = "${var.queue_names.webhook_single}-dlq"
  
  message_retention_seconds = 1209600  # 14 days
  
  tags = merge(var.tags, {
    Name = "${var.queue_names.webhook_single}-dlq"
    Type = "DLQ"
  })
}

resource "aws_sqs_queue" "webhook_import_dlq" {
  name = "${var.queue_names.webhook_import}-dlq"
  
  message_retention_seconds = 1209600  # 14 days
  
  tags = merge(var.tags, {
    Name = "${var.queue_names.webhook_import}-dlq"
    Type = "DLQ"
  })
}

resource "aws_sqs_queue" "intent_dlq" {
  name = "${var.queue_names.intent}-dlq"
  
  message_retention_seconds = 1209600  # 14 days
  
  tags = merge(var.tags, {
    Name = "${var.queue_names.intent}-dlq"
    Type = "DLQ"
  })
}

# Main SQS Queues
resource "aws_sqs_queue" "webhook_single_queue" {
  name = var.queue_names.webhook_single
  
  visibility_timeout_seconds = 300  # 5 minutes
  message_retention_seconds  = 345600  # 4 days
  receive_wait_time_seconds  = 20  # Long polling
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_single_dlq.arn
    maxReceiveCount     = 3
  })
  
  tags = merge(var.tags, {
    Name = var.queue_names.webhook_single
    Type = "Main"
  })
}

resource "aws_sqs_queue" "webhook_import_queue" {
  name = var.queue_names.webhook_import
  
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_import_dlq.arn
    maxReceiveCount     = 3
  })
  
  tags = merge(var.tags, {
    Name = var.queue_names.webhook_import
    Type = "Main"
  })
}

resource "aws_sqs_queue" "intent_queue" {
  name = var.queue_names.intent
  
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.intent_dlq.arn
    maxReceiveCount     = 3
  })
  
  tags = merge(var.tags, {
    Name = var.queue_names.intent
    Type = "Main"
  })
}

# SQS Queue Policy (if needed for cross-account access)
resource "aws_sqs_queue_policy" "queue_policies" {
  for_each = {
    webhook_single = aws_sqs_queue.webhook_single_queue.id
    webhook_import = aws_sqs_queue.webhook_import_queue.id
    intent         = aws_sqs_queue.intent_queue.id
  }
  
  queue_url = each.value
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = data.aws_caller_identity.current.account_id
        }
        Action   = "sqs:*"
        Resource = "*"
      }
    ]
  })
}
