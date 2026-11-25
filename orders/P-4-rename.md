【P-4】改名为「c可视」（改 index.html + package.sh + package.ps1，共 5 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这三个文件的对应行；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check`（不涉及 js）、`bash -n package.sh`。
产物命名约定：**显示名用中文「c可视」**（.app 名字、菜单名），**发布文件名用 ASCII**（dmg/zip 便于 URL）。

## 第 1 次调用：edit #1 —— index.html 标题
原文：
```
  <title>C/C++ 代码可视化</title>
```
改为：
```
  <title>c可视 · C/C++ 代码可视化</title>
```

## 第 2 次调用：edit #2 —— index.html 品牌
原文：
```
    <span class="logo">C++</span>
    <span class="title">代码可视化</span>
    <span class="badge">M1</span>
```
改为：
```
    <span class="logo">c</span>
    <span class="title">可视</span>
    <span class="badge">v1.0</span>
```

## 第 3 次调用：edit #3 —— package.sh 应用名
原文：
```
APP="cppviz"
```
改为：
```
APP="c可视"
```

## 第 4 次调用：edit #4 —— package.sh 末尾重命名 dmg（ASCII 文件名便于发布）
原文：
```
echo "package ok: dist/out"
```
改为：
```
DMG="dist/out/$APP-$VERSION.dmg"
if [ -f "$DMG" ]; then
  mv "$DMG" "dist/out/c-visual-$VERSION.dmg"
fi
echo "package ok: dist/out"
```

## 第 5 次调用：edit #5 —— package.ps1 应用名 + zip 名
原文：
```
$APP = 'cppviz'
```
改为：
```
$APP = 'c可视'
```
原文：
```
Compress-Archive -Path "dist\out\$APP" -DestinationPath "dist\out\$APP-windows.zip" -Force
Write-Host "package ok: dist\out\$APP-windows.zip"
```
改为：
```
Compress-Archive -Path "dist\out\$APP" -DestinationPath "dist\out\c-visual-windows.zip" -Force
Write-Host "package ok: dist\out\c-visual-windows.zip"
```

## 第 6 次调用：检查
```
bash -n package.sh   → 无输出、退出码 0
grep -n 'APP="c可视"\|c-visual' package.sh package.ps1
```

## 收工
总结 ≤1 行：5 处是否完成。不要写别的。
