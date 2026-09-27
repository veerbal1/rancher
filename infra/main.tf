terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"

  default_tags {
    tags = {
      project = "rancher"
    }
  }
}

resource "aws_kinesis_stream" "cow_events" {
  name             = "cow-events"
  retention_period = 24

  stream_mode_details {
    stream_mode = "ON_DEMAND"
  }
}

output "stream_name" {
  value = aws_kinesis_stream.cow_events.name
}

output "stream_arn" {
  value = aws_kinesis_stream.cow_events.arn
}
