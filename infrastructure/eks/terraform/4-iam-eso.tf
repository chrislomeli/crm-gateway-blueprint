resource "aws_iam_policy" "eso_secrets_policy" {
  # ... existing config ...

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecrets"
        ]
        Resource = [
          # Update to match your actual secret naming pattern
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:dev-rds-default*",
          # Or use a wildcard for all your RDS secrets
          "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:*-rds-*"
        ]
      },
      # ... rest of policy
    ]
  })
}