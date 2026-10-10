#!/usr/bin/env bash
# Registers the application's domain with the Tesla Fleet API (once per region), after the
# public key is served at https://<domain>/.well-known/appspecific/com.tesla.3p.public-key.pem.
# The client credentials are decrypted on the fly (Touch ID), never written to disk.
set -euo pipefail
cd "$(dirname "$0")/.."
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/se-identity.txt}"
DOMAIN="${1:-charging-planning.crn-tech.fr}"
AUDIENCE="${TESLA_AUDIENCE:-https://fleet-api.prd.eu.vn.cloud.tesla.com}"

curl -fsS "https://$DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem" >/dev/null ||
  { echo "public key not served on $DOMAIN yet" >&2; exit 1; }

secrets="infrastructure/secrets/production.sops.yaml"
client_id="$(sops decrypt --extract '["tesla_client_id"]' "$secrets")"
client_secret="$(sops decrypt --extract '["tesla_client_secret"]' "$secrets")"

partner_token="$(curl -fsS https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "client_secret=$client_secret" \
  --data-urlencode 'scope=openid vehicle_device_data vehicle_location' \
  --data-urlencode "audience=$AUDIENCE" | jq -r .access_token)"

curl -fsS -X POST "$AUDIENCE/api/1/partner_accounts" \
  -H "Authorization: Bearer $partner_token" -H 'Content-Type: application/json' \
  -d "{\"domain\":\"$DOMAIN\"}" | jq '{domain: .response.domain, registered: (.response != null)}'
