#!/usr/bin/env bash
# Starts Speculos, Ledger's device emulator, running the real XRP app, for Ledger plan approvals.
#
# Usage: ./run.sh [stax|nanosp]          (default: stax)
# Port:  SPECULOS_PORT, default 5001. macOS AirPlay Receiver usually holds 5000.
# Screen also on VNC: vnc://127.0.0.1:41000, password "speculos".
#
# The first run writes a random seed to .seed (gitignored) and reuses it, so the XRP address stays
# the same. Never use the seed of a wallet that holds real funds.
set -euo pipefail

MODEL="${1:-stax}"
PORT="${SPECULOS_PORT:-5001}"
IMAGE="${SPECULOS_IMAGE:-ghcr.io/ledgerhq/speculos:latest}"
here="$(cd "$(dirname "$0")" && pwd -P)"

case "$MODEL" in
  stax) DMK_MODEL="STAX" ;;
  nanosp) DMK_MODEL="NANO_SP" ;;
  *) echo "Unknown model '$MODEL'. Use stax or nanosp." >&2; exit 1 ;;
esac

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then run this again." >&2
  exit 1
fi

[ -f "$here/.seed" ] || openssl rand -hex 32 > "$here/.seed"

docker rm -f speculos-xrp >/dev/null 2>&1 || true
docker run -d --name speculos-xrp \
  -p "127.0.0.1:${PORT}:5000" -p 127.0.0.1:41000:41000 \
  -v "$here/apps:/apps:ro" \
  "$IMAGE" \
  --model "$MODEL" --display headless --api-port 5000 \
  --vnc-port 41000 --vnc-password speculos \
  --seed "$(cat "$here/.seed")" \
  "/apps/$MODEL/app.elf" >/dev/null

for _ in $(seq 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${PORT}"; then
    echo "Speculos is ready: Ledger ${MODEL} with the XRP app on http://127.0.0.1:${PORT}"
    echo
    echo "Start the demo with Ledger approval:"
    echo "  LEDGER_SPECULOS_URL=http://127.0.0.1:${PORT} LEDGER_SPECULOS_MODEL=${DMK_MODEL} pnpm demo"
    echo
    echo "Stop the emulator: docker rm -f speculos-xrp"
    exit 0
  fi
  sleep 1
done
echo "Speculos did not answer on port ${PORT} after 60 s. Check: docker logs speculos-xrp" >&2
exit 1
