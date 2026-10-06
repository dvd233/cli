#!/bin/bash
set -euo pipefail
SOURCE=$(cd "$1" && pwd)
STATE=$2
HARNESS=$(cd "$(dirname "$0")" && pwd)
RUN="$HARNESS/run-isolated.sh"
bash "$HARNESS/verify-source.sh" "$SOURCE"
mkdir -p "$STATE"
cc -O2 -Wall -Wextra "$HARNESS/no-network.c" -o "$STATE/no-network"
bash "$RUN" "$STATE" "$STATE/no-network" python3 "$HARNESS/verify-socket-guard.py"
cd "$SOURCE"
# Build the repository's real distributable/declarations; run that SDK on the
# selected Node version rather than replacing production code with test logic.
bash "$RUN" "$STATE" bun run build
bash "$RUN" "$STATE" node --version
bash "$RUN" "$STATE" "$STATE/no-network" node "$HARNESS/sdk-probes.mjs" "file://$SOURCE/dist/sdk.mjs"
bash "$RUN" "$STATE" node "$HARNESS/sdk-transport.mjs" "file://$SOURCE/dist/sdk.mjs"
bash "$HARNESS/verify-source.sh" "$SOURCE"
