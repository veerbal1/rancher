resource "aws_dynamodb_table" "connections" {
  name         = "cow-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connection_id"

  attribute {
    name = "connection_id"
    type = "S"
  }

  attribute {
    name = "farmer_id"
    type = "S"
  }

  global_secondary_index {
    name            = "farmer_id"
    projection_type = "KEYS_ONLY"

    key_schema {
      attribute_name = "farmer_id"
      key_type       = "HASH"
    }
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_apigatewayv2_api" "ws" {
  name                       = "cow-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_integration" "ws" {
  api_id             = aws_apigatewayv2_api.ws.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.ws.invoke_arn
}

resource "aws_apigatewayv2_route" "ws" {
  for_each = toset(["$connect", "$disconnect"])

  api_id    = aws_apigatewayv2_api.ws.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.ws.id}"
}

resource "aws_apigatewayv2_deployment" "ws" {
  api_id = aws_apigatewayv2_api.ws.id

  triggers = {
    redeployment = sha1(jsonencode([aws_apigatewayv2_integration.ws, aws_apigatewayv2_route.ws]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_apigatewayv2_stage" "ws" {
  api_id        = aws_apigatewayv2_api.ws.id
  name          = "live"
  deployment_id = aws_apigatewayv2_deployment.ws.id
}

output "ws_url" {
  value = aws_apigatewayv2_stage.ws.invoke_url
}

data "archive_file" "ws" {
  type        = "zip"
  source_file = "${path.module}/../build/ws/bootstrap"
  output_path = "${path.module}/../build/ws.zip"
}

resource "aws_iam_role" "ws" {
  name = "cow-ws"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ws_logs" {
  role       = aws_iam_role.ws.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ws_dynamodb" {
  role = aws_iam_role.ws.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
      Resource = aws_dynamodb_table.connections.arn
    }]
  })
}

resource "aws_lambda_function" "ws" {
  function_name    = "cow-ws"
  role             = aws_iam_role.ws.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.ws.output_path
  source_code_hash = data.archive_file.ws.output_base64sha256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.connections.name
    }
  }
}

resource "aws_lambda_permission" "ws" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

data "archive_file" "push" {
  type        = "zip"
  source_file = "${path.module}/../build/push/bootstrap"
  output_path = "${path.module}/../build/push.zip"
}

resource "aws_iam_role" "push" {
  name = "cow-push"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "push_kinesis" {
  role       = aws_iam_role.push.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole"
}

resource "aws_iam_role_policy" "push" {
  role = aws_iam_role.push.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = "${aws_dynamodb_table.connections.arn}/index/farmer_id"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = aws_dynamodb_table.rancher.arn
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.connections.arn
      },
      {
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = "${aws_apigatewayv2_stage.ws.execution_arn}/POST/@connections/*"
      },
    ]
  })
}

resource "aws_lambda_function" "push" {
  function_name    = "cow-push"
  role             = aws_iam_role.push.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.push.output_path
  source_code_hash = data.archive_file.push.output_base64sha256

  environment {
    variables = {
      TABLE_NAME    = aws_dynamodb_table.connections.name
      RANCHER_TABLE = aws_dynamodb_table.rancher.name
      WS_ENDPOINT   = replace(aws_apigatewayv2_stage.ws.invoke_url, "wss://", "https://")
    }
  }
}

resource "aws_lambda_event_source_mapping" "push" {
  event_source_arn  = aws_kinesis_stream.cow_events.arn
  function_name     = aws_lambda_function.push.arn
  starting_position = "LATEST"

  depends_on = [aws_iam_role_policy_attachment.push_kinesis]
}
