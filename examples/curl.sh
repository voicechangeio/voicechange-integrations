#!/usr/bin/env bash
# The VoiceChange local API from the shell (macOS/Linux; needs jq).
#   ./curl.sh voice.list
#   ./curl.sh voice.set '{"id":"natural"}'
#   ./curl.sh voice.toggle
#   ./curl.sh mixer.set '{"pitch":-4,"robot":0.3}'
set -euo pipefail
if [[ "$(uname)" == Darwin ]]; then
  FILE="$HOME/Library/Application Support/io.voicechange.desktop/control.json"
else
  FILE="${XDG_DATA_HOME:-$HOME/.local/share}/io.voicechange.desktop/control.json"
fi
FILE="${VOICECHANGE_CONTROL_FILE:-$FILE}"
PORT=$(jq -r .port "$FILE")
TOKEN=$(jq -r .token "$FILE")
BODY="${2:-}"; BODY="${BODY:-"{}"}"

curl -s -X POST "http://127.0.0.1:$PORT/v1/${1:-state}" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$BODY" | jq .
