data "archive_file" "farm_api" {
  type        = "zip"
  source_file = "${path.module}/../build/farm-api/bootstrap"
  output_path = "${path.module}/../build/farm-api.zip"
}

resource "aws_iam_role" "farm_api" {
  name = "farm-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "farm_api_logs" {
  role       = aws_iam_role.farm_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "farm_api_dynamodb" {
  role = aws_iam_role.farm_api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Scan", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.rancher.arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = aws_dynamodb_table.cow_positions.arn
      },
    ]
  })
}

resource "aws_lambda_function" "farm_api" {
  function_name    = "farm-api"
  role             = aws_iam_role.farm_api.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.farm_api.output_path
  source_code_hash = data.archive_file.farm_api.output_base64sha256

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.rancher.name
      COW_TABLE_NAME = aws_dynamodb_table.cow_positions.name
    }
  }
}

resource "aws_apigatewayv2_api" "farm" {
  name          = "farm-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:5173"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE"]
    allow_headers = ["content-type"]
  }
}

resource "aws_apigatewayv2_integration" "farm_api" {
  api_id                 = aws_apigatewayv2_api.farm.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.farm_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "farm_api" {
  for_each = toset([
    "POST /farmers",
    "GET /farmers",
    "POST /farmers/{id}/paddocks",
    "GET /farmers/{id}/paddocks",
    "PATCH /farmers/{id}/paddocks/{paddockId}",
    "DELETE /farmers/{id}/paddocks/{paddockId}",
    "POST /farmers/{id}/collars",
    "GET /farmers/{id}/collars",
    "PATCH /farmers/{id}/collars",
    "DELETE /farmers/{id}/collars/{collarId}",
    "POST /farmers/{id}/shifts",
    "GET /farmers/{id}/shifts",
    "POST /farmers/{id}/shifts/{shiftId}/turn-back",
  ])

  api_id    = aws_apigatewayv2_api.farm.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.farm_api.id}"
}

resource "aws_apigatewayv2_route" "world" {
  api_id             = aws_apigatewayv2_api.farm.id
  route_key          = "GET /world"
  target             = "integrations/${aws_apigatewayv2_integration.farm_api.id}"
  authorization_type = "AWS_IAM"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.farm.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }
}

resource "aws_lambda_permission" "farm_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.farm_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.farm.execution_arn}/*/*"
}

output "farm_api_url" {
  value = aws_apigatewayv2_api.farm.api_endpoint
}
