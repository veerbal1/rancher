data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../build/api/bootstrap"
  output_path = "${path.module}/../build/api.zip"
}

resource "aws_iam_role" "api" {
  name = "cow-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_dynamodb" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "dynamodb:Query"
      Resource = aws_dynamodb_table.cow_positions.arn
    }]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "cow-api"
  role             = aws_iam_role.api.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.cow_positions.name
    }
  }
}

# Public URL (no auth) so the browser UI can read simulated cow positions.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["GET"]
  }
}

output "api_url" {
  value = aws_lambda_function_url.api.function_url
}
