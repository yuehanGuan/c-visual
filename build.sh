#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
JAVAC="$JAVA_HOME/bin/javac"

if [ ! -x "$JAVAC" ]; then
  echo "找不到 javac：$JAVAC" >&2
  echo "请先安装 JDK 21（brew install openjdk@21），或设置 JAVA_HOME" >&2
  exit 1
fi

rm -rf out/classes
mkdir -p out/classes

find src/main/java -name '*.java' > out/sources.txt
if [ ! -s out/sources.txt ]; then
  echo "没有找到 Java 源文件" >&2
  exit 1
fi

"$JAVAC" -encoding UTF-8 -d out/classes @out/sources.txt
cp -R src/main/resources/. out/classes/

echo "build ok"
