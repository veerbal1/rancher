data "archive_file" "ingest" {
  type        = "zip"
  source_file = "${path.module}/../build/ingest/bootstrap"
  output_path = "${path.module}/../build/ingest.zip"
}

resource "aws_iam_role" "ingest" {
  name = "cow-ingest"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ingest_logs" {
  role       = aws_iam_role.ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "ingest" {
  function_name    = "cow-ingest"
  role             = aws_iam_role.ingest.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = data.archive_file.ingest.output_path
  source_code_hash = data.archive_file.ingest.output_base64sha256
  environment {
    variables = {
      TABLE_NAME    = aws_dynamodb_table.cow_positions.name
      RANCHER_TABLE = aws_dynamodb_table.rancher.name
    }
  }
}

resource "aws_iam_role_policy_attachment" "ingest_kinesis" {
  role       = aws_iam_role.ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole"
}

resource "aws_lambda_event_source_mapping" "ingest" {
  event_source_arn  = aws_kinesis_stream.cow_events.arn
  function_name     = aws_lambda_function.ingest.arn
  starting_position = "LATEST"

  depends_on = [aws_iam_role_policy_attachment.ingest_kinesis]
}

resource "aws_dynamodb_table" "cow_positions" {
  name         = "cow-positions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "farmer_id"
  range_key    = "collar_id"

  attribute {
    name = "farmer_id"
    type = "S"
  }

  attribute {
    name = "collar_id"
    type = "S"
  }
}

resource "aws_iam_role_policy" "ingest_dynamodb" {
  role = aws_iam_role.ingest.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem"]
        Resource = aws_dynamodb_table.cow_positions.arn
      },
      {
        Effect   = "Allow"
        Action   = "dynamodb:Query"
        Resource = aws_dynamodb_table.rancher.arn
      },
    ]
  })
}
