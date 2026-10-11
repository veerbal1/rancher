data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_route_table" "main" {
  vpc_id = data.aws_vpc.default.id
  filter {
    name   = "association.main"
    values = ["true"]
  }
}

resource "aws_security_group" "lambda_vpc" {
  name   = "rancher-lambda"
  vpc_id = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "cache" {
  name   = "rancher-cache"
  vpc_id = data.aws_vpc.default.id

  ingress {
    from_port       = 6379
    to_port         = 6380
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_vpc.id]
  }
}

resource "aws_elasticache_serverless_cache" "positions" {
  engine               = "valkey"
  name                 = "rancher-positions"
  major_engine_version = "8"
  subnet_ids           = data.aws_subnets.default.ids
  security_group_ids   = [aws_security_group.cache.id]

  cache_usage_limits {
    data_storage {
      maximum = 1
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = 5000
    }
  }
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = data.aws_vpc.default.id
  service_name      = "com.amazonaws.ap-south-1.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [data.aws_route_table.main.id]
}

locals {
  valkey_addr = "${aws_elasticache_serverless_cache.positions.endpoint[0].address}:${aws_elasticache_serverless_cache.positions.endpoint[0].port}"
}
