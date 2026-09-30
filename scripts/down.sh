#!/bin/sh
set -e
cd "$(dirname "$0")/.."
terraform -chdir=infra destroy
for f in cow-api farm-api cow-ingest cow-ws cow-push; do
  aws logs delete-log-group --region ap-south-1 --log-group-name /aws/lambda/$f 2>/dev/null || true
done
echo "down"
