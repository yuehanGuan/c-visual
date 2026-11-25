【P-3】Windows 打包脚本 + GitHub Actions（新建 2 个文件）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 新建 `package.ps1` 和 `.github/workflows/release.yml`，不读其他文件。
⚠️ **不要跑 PowerShell 脚本**（这台机器是 macOS）；允许 `ls` 检查文件存在。

## 第 1 次调用：新建 package.ps1（整文件照抄）
```
# Build a Windows app-image zip with jpackage.  Run on Windows.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Eclipse Adoptium\jdk-21' }
$JAVAC = Join-Path $JAVA_HOME 'bin\javac.exe'
$JAR = Join-Path $JAVA_HOME 'bin\jar.exe'
$JPACKAGE = Join-Path $JAVA_HOME 'bin\jpackage.exe'
$VERSION = if ($env:VERSION) { $env:VERSION } else { '1.0.0' }
$APP = 'cppviz'

if (-not (Test-Path $JPACKAGE)) { throw "jpackage not found: $JPACKAGE (JDK 21 required)" }

Remove-Item -Recurse -Force out\classes, dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force out\classes | Out-Null
$sources = Get-ChildItem -Recurse src\main\java -Filter *.java | ForEach-Object { $_.FullName }
& $JAVAC -encoding UTF-8 -d out\classes @sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
Copy-Item -Recurse -Force src\main\resources\* out\classes\
Copy-Item -Force tracer\tracer.py out\classes\tracer.py

New-Item -ItemType Directory -Force dist\input, dist\out | Out-Null
& $JAR --create --file "dist\input\$APP.jar" --main-class dev.cppviz.Main -C out\classes .
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }

& $JPACKAGE --type app-image --name $APP --app-version $VERSION `
  --input dist\input --main-jar "$APP.jar" --main-class dev.cppviz.Main `
  --dest dist\out --java-options "-Xmx512m"
if ($LASTEXITCODE -ne 0) { throw 'jpackage failed' }

Compress-Archive -Path "dist\out\$APP" -DestinationPath "dist\out\$APP-windows.zip" -Force
Write-Host "package ok: dist\out\$APP-windows.zip"
```

## 第 2 次调用：新建 .github/workflows/release.yml（整文件照抄）
```
name: release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  macos:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - name: build dmg
        run: |
          chmod +x build.sh package.sh
          VERSION="${GITHUB_REF_NAME#v}" ./package.sh
      - uses: actions/upload-artifact@v4
        with:
          name: cppviz-macos
          path: dist/out/*.dmg
          if-no-files-found: error

  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - name: build zip
        shell: pwsh
        run: |
          $env:VERSION = $env:GITHUB_REF_NAME -replace '^v', ''
          ./package.ps1
      - uses: actions/upload-artifact@v4
        with:
          name: cppviz-windows
          path: dist/out/*.zip
          if-no-files-found: error

  publish:
    needs: [macos, windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**/*
```

## 第 3 次调用：检查
```
ls -l package.ps1 .github/workflows/release.yml
```

## 收工
总结 ≤1 行：两个文件是否创建。不要写别的。
