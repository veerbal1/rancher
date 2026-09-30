#!/bin/sh
set -e
cd "$(dirname "$0")/.."
bucket=$(terraform -chdir=infra output -raw web_bucket)
dist=$(terraform -chdir=infra output -raw web_distribution_id)
(cd ui && npm run build)
aws s3 sync ui/dist "s3://$bucket" --delete
aws cloudfront create-invalidation --distribution-id "$dist" --paths "/*" > /dev/null
echo "deployed $(terraform -chdir=infra output -raw site_url)"
