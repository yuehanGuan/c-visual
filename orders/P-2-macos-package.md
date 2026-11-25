【P-2】macOS 打包脚本（新建 package.sh，1 个文件）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 新建 `package.sh`，不读其他文件（除 `build.sh` 确认命名）。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `chmod +x package.sh` 与 `./package.sh`（要跑一次验证能出 .app）。

## 目标
`./package.sh` 一键构建：jar → `jpackage` app-image + dmg，产物在 `dist/out/`。

## 第 1 次调用：新建 package.sh（整文件，逐行照抄）
```
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

```

## 第 2 次调用：chmod + 跑一次
```
chmod +x package.sh
./package.sh
```
期望：输出 `package ok`，`dist/out/cppviz.app` 和 `dist/out/cppviz-1.0.0.dmg` 存在。

## 第 3 次调用：检查
```
ls -lh dist/out
```

## 收工
总结 ≤2 行：是否产出 .app 与 .dmg、产物大小。不要写别的。
