#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
JAVA="$JAVA_HOME/bin/java"

./build.sh
exec "$JAVA" -cp out/classes dev.cppviz.Main "$@"
