#!/bin/sh
set -e
name=rancher-web
restrictions=$(printf '{"AllowActions":["geo-maps:*"],"AllowResources":["arn:aws:geo-maps:ap-south-1::provider/default"],"AllowReferers":["%s/*","http://localhost:5173/*"]}' "$1")
if aws location describe-key --region ap-south-1 --key-name $name > /dev/null 2>&1; then
  aws location update-key --region ap-south-1 --key-name $name --restrictions "$restrictions" --force-update > /dev/null
else
  aws location create-key --region ap-south-1 --key-name $name --no-expiry --restrictions "$restrictions" > /dev/null
fi
aws location describe-key --region ap-south-1 --key-name $name --query Key --output text
