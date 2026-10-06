#!/bin/bash
set -euo pipefail
SOURCE=$(cd "$1" && pwd)
test "$(git -C "$SOURCE" rev-parse HEAD)" = da978118b8accb38e007582a8a226ab833bafaad
test "$(git -C "$SOURCE" rev-parse HEAD^{tree})" = d2446999bd579e489d9bfbefbf49832434c3cc59
test "$(git -C "$SOURCE" show -s --format=%P HEAD)" = 06e47c70b76f419196678367dae62acca4c94076
test -z "$(git -C "$SOURCE" status --porcelain)"
cd "$SOURCE"
sha256sum --check <<'HASHES'
60c6e29369e007030cfab42c0f743d4a79242ed56bdeff98d88252dc5e035408  src/sdk/client.ts
5041984c324880d5f83333e2849bdc53adeeef08877f5eeb1b0d3a40416c5492  test/sdk/stream-cleanup.test.ts
HASHES
printf 'Validated feature SHA=%s tree=%s\n' "$(git rev-parse HEAD)" "$(git rev-parse HEAD^{tree})"
