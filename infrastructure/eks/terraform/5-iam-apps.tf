# IAM policy for application pods to access SQS
resource "aws_iam_policy" "app_sqs_policy" {
  name        = "${var.cluster_name}-${var.namespace}-app-sqs-policy"
  path        = "/"
  description = "IAM policy for applications to access SQS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = [
          aws_sqs_queue.webhook_single_queue.arn,
          aws_sqs_queue.webhook_import_queue.arn,
          aws_sqs_queue.intent_queue.arn
        ]
      }
    ]
  })
  
  tags = var.tags
}

# IAM role for application service account
resource "aws_iam_role" "app_role" {
  name = "${var.cluster_name}-${var.namespace}-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.eks.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringLike = {
            "${replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:${var.namespace}:*"
            "${replace(data.aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "app_sqs_policy_attachment" {
  role       = aws_iam_role.app_role.name
  policy_arn = aws_iam_policy.app_sqs_policy.arn
}
