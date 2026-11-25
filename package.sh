#!/usr/bin/env bash
# Build a macOS .app and .dmg with jpackage.  Run on macOS only.
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
JAVA="$JAVA_HOME/bin/java"
JAR_TOOL="$JAVA_HOME/bin/jar"
JPACKAGE="$JAVA_HOME/bin/jpackage"
VERSION="${VERSION:-1.0.0}"
APP="cppviz"

[ -x "$JPACKAGE" ] || { echo "找不到 jpackage：$JPACKAGE（需要 JDK 21）" >&2; exit 1; }

./build.sh

rm -rf dist
mkdir -p dist/input dist/out
"$JAR_TOOL" --create --file "dist/input/$APP.jar" --main-class dev.cppviz.Main -C out/classes .

"$JPACKAGE" \
  --type app-image \
  --name "$APP" \
  --app-version "$VERSION" \
  --input dist/input \
  --main-jar "$APP.jar" \
  --main-class dev.cppviz.Main \
  --dest dist/out \
  --java-options "-Xmx512m"

"$JPACKAGE" \
  --type dmg \
  --name "$APP" \
  --app-version "$VERSION" \
  --input dist/input \
  --main-jar "$APP.jar" \
  --main-class dev.cppviz.Main \
  --dest dist/out \
  --mac-package-name "cppviz"

echo "package ok: dist/out"
