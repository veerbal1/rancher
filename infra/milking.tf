resource "aws_lambda_function" "milking" {
  function_name    = "milking"
  role             = aws_iam_role.farm_api.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.farm_api.output_path
  source_code_hash = data.archive_file.farm_api.output_base64sha256
  timeout          = 60

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.rancher.name
      COW_TABLE_NAME = aws_dynamodb_table.cow_positions.name
      MODE           = "milking"
    }
  }
}

resource "aws_cloudwatch_event_rule" "milking" {
  name                = "milking-every-minute"
  schedule_expression = "rate(1 minute)"
}

resource "aws_cloudwatch_event_target" "milking" {
  rule = aws_cloudwatch_event_rule.milking.name
  arn  = aws_lambda_function.milking.arn
}

resource "aws_lambda_permission" "milking" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.milking.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.milking.arn
}
