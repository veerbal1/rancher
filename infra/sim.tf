resource "aws_s3_bucket" "sim" {
  bucket_prefix = "rancher-sim-"
  force_destroy = true
}

resource "aws_s3_object" "sim" {
  bucket      = aws_s3_bucket.sim.id
  key         = "sim"
  source      = "${path.module}/../build/sim"
  source_hash = filemd5("${path.module}/../build/sim")
}

resource "aws_iam_role" "sim" {
  name = "rancher-sim"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "sim" {
  role = aws_iam_role.sim.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.sim.arn}/sim"
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:PutRecords"]
        Resource = aws_kinesis_stream.cow_events.arn
      },
      {
        Effect   = "Allow"
        Action   = ["execute-api:Invoke"]
        Resource = "${aws_apigatewayv2_api.farm.execution_arn}/*/GET/world"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "sim_ssm" {
  role       = aws_iam_role.sim.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "sim" {
  name = "rancher-sim"
  role = aws_iam_role.sim.name
}

data "aws_ssm_parameter" "al2023_arm" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "sim" {
  name   = "rancher-sim"
  vpc_id = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "sim" {
  ami                         = data.aws_ssm_parameter.al2023_arm.value
  instance_type               = "t4g.nano"
  iam_instance_profile        = aws_iam_instance_profile.sim.name
  vpc_security_group_ids      = [aws_security_group.sim.id]
  associate_public_ip_address = true
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required"
  }

  user_data = <<-EOF
    #!/bin/bash
    # sim ${aws_s3_object.sim.source_hash}
    aws s3 cp s3://${aws_s3_bucket.sim.id}/sim /usr/local/bin/sim
    chmod +x /usr/local/bin/sim
    cat > /etc/systemd/system/sim.service <<UNIT
    [Unit]
    Wants=network-online.target
    After=network-online.target

    [Service]
    Environment=AWS_REGION=ap-south-1
    Environment=WORLD_URL=${aws_apigatewayv2_api.farm.api_endpoint}/world
    ExecStart=/usr/local/bin/sim
    Restart=always
    DynamicUser=yes

    [Install]
    WantedBy=multi-user.target
    UNIT
    systemctl enable --now sim
  EOF

  tags = {
    Name = "rancher-sim"
  }
}

output "world_url" {
  value = "${aws_apigatewayv2_api.farm.api_endpoint}/world"
}

output "sim_instance_id" {
  value = aws_instance.sim.id
}
