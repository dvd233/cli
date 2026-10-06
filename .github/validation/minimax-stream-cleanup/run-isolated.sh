#!/bin/bash
set -euo pipefail
STATE=$1
shift
mkdir -p "$STATE/home" "$STATE/config"
env -i PATH="$PATH" HOME="$STATE/home" MMX_CONFIG_DIR="$STATE/config" NO_COLOR=1 "$@"
