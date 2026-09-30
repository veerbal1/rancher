#!/bin/sh
set -e
cd "$(dirname "$0")/.."
for f in api farm-api ingest ws push; do
  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o build/$f/bootstrap ./lambdas/$f
done
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o build/sim ./edge
terraform -chdir=infra init -input=false > /dev/null
terraform -chdir=infra apply

out() { terraform -chdir=infra output -raw "$1"; }
key=$(./scripts/map-key.sh "$(out site_url)")
env=ui/.env.local
touch $env
grep -v -e '^VITE_API_URL=' -e '^VITE_FARM_API_URL=' -e '^VITE_WS_URL=' -e '^VITE_LOCATION_KEY=' $env > $env.tmp || true
{
  cat $env.tmp
  echo "VITE_API_URL=$(out api_url)"
  echo "VITE_FARM_API_URL=$(out farm_api_url)"
  echo "VITE_WS_URL=$(out ws_url)"
  echo "VITE_LOCATION_KEY=$key"
} > $env
rm $env.tmp

python3 scripts/seed.py "$(out farm_api_url)"
./scripts/deploy-web.sh
