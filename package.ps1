# Build a Windows app-image zip with jpackage.  Run on Windows.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Eclipse Adoptium\jdk-21' }
$JAVAC = Join-Path $JAVA_HOME 'bin\javac.exe'
$JAR = Join-Path $JAVA_HOME 'bin\jar.exe'
$JPACKAGE = Join-Path $JAVA_HOME 'bin\jpackage.exe'
$VERSION = if ($env:VERSION) { $env:VERSION } else { '1.0.0' }
$APP = 'c-visual'
$JAR_NAME = 'c-visual.jar'

if (-not (Test-Path $JPACKAGE)) { throw "jpackage not found: $JPACKAGE (JDK 21 required)" }

Remove-Item -Recurse -Force out\classes, dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force out\classes | Out-Null
$sources = Get-ChildItem -Recurse src\main\java -Filter *.java | ForEach-Object { $_.FullName }
& $JAVAC -encoding UTF-8 -d out\classes @sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
Copy-Item -Recurse -Force src\main\resources\* out\classes\
Copy-Item -Force tracer\tracer.py out\classes\tracer.py

New-Item -ItemType Directory -Force dist\input, dist\out | Out-Null
& $JAR --create --file "dist\input\$JAR_NAME" --main-class dev.cppviz.Main -C out\classes .
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }

& $JPACKAGE --type app-image --name $APP --app-version $VERSION `
  --input dist\input --main-jar "$JAR_NAME" --main-class dev.cppviz.Main `
  --dest dist\out --java-options "-Xmx512m"
if ($LASTEXITCODE -ne 0) { throw 'jpackage failed' }

Compress-Archive -Path "dist\out\$APP" -DestinationPath "dist\out\c-visual-windows.zip" -Force
Write-Host "package ok: dist\out\c-visual-windows.zip"
