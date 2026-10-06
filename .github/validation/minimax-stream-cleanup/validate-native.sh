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
bash "$RUN" "$STATE" "$STATE/no-network" bun "$HARNESS/guard-self-test.mjs"
cd "$SOURCE"
bash "$RUN" "$STATE" bun run typecheck
bash "$RUN" "$STATE" bun run lint
# Full native suite needs loopback servers. JS fetch guard blocks provider
# URLs and redirects; the stronger syscall guard is used for no-socket probes.
bash "$RUN" "$STATE" bun test --preload "$HARNESS/offline-preload.ts"
bash "$RUN" "$STATE" "$STATE/no-network" bun test --preload "$HARNESS/offline-preload.ts" test/sdk/stream-cleanup.test.ts
bash "$RUN" "$STATE" bun run build
bash "$RUN" "$STATE" bun run build:dev
bash "$RUN" "$STATE" bun build src/main.ts --compile --outfile dist/mmx
bash "$RUN" "$STATE" "$STATE/no-network" ./dist/mmx --version
bash "$RUN" "$STATE" "$STATE/no-network" bun "$HARNESS/sdk-probes.mjs" "file://$SOURCE/dist/sdk.mjs"
bash "$RUN" "$STATE" bun "$HARNESS/sdk-transport.mjs" "file://$SOURCE/dist/sdk.mjs"
bash "$HARNESS/verify-source.sh" "$SOURCE"
