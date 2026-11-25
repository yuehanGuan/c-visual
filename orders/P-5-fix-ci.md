【P-5】修 CI：macos-latest + jar 文件名用 ASCII（改 package.sh + package.ps1 + workflow，共 5 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这三个文件的对应行；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `bash -n package.sh`。

## 背景（CI 实测）
- macOS job：`The configuration 'macos-14-arm64-us-default' is not supported` → 用 `macos-latest`
- Windows job：`jar` 报 `The filename, directory name, or volume label syntax is incorrect`（`File.createTempFile`）→
  jar 文件名不能是中文 `c可视.jar`；改成 ASCII `c-visual.jar`（app 名仍是 c可视）

## 第 1 次调用：edit #1 —— package.sh：jar 名独立
原文：
```
APP="c可视"
```
改为：
```
APP="c可视"
JAR_NAME="c-visual.jar"
```
原文：
```
"$JAR_TOOL" --create --file "dist/input/$APP.jar" --main-class dev.cppviz.Main -C out/classes .
```
改为：
```
"$JAR_TOOL" --create --file "dist/input/$JAR_NAME" --main-class dev.cppviz.Main -C out/classes .
```
原文（两处）：
```
  --main-jar "$APP.jar" \
```
改为（两处）：
```
  --main-jar "$JAR_NAME" \
```

## 第 2 次调用：edit #2 —— package.ps1：jar 名独立
原文：
```
$APP = 'c可视'
```
改为：
```
$APP = 'c可视'
$JAR_NAME = 'c-visual.jar'
```
原文：
```
& $JAR --create --file "dist\input\$APP.jar" --main-class dev.cppviz.Main -C out\classes .
```
改为：
```
& $JAR --create --file "dist\input\$JAR_NAME" --main-class dev.cppviz.Main -C out\classes .
```
原文：
```
  --input dist\input --main-jar "$APP.jar" --main-class dev.cppviz.Main `
```
改为：
```
  --input dist\input --main-jar "$JAR_NAME" --main-class dev.cppviz.Main `
```

## 第 3 次调用：edit #3 —— workflow：macos-latest
原文：
```
    runs-on: macos-14
```
改为：
```
    runs-on: macos-latest
```

## 第 4 次调用：检查
```
bash -n package.sh        → 无输出、退出码 0
grep -n "JAR_NAME\|macos-latest" package.sh package.ps1 .github/workflows/release.yml
```

## 收工
总结 ≤1 行：5 处是否完成。不要写别的。
