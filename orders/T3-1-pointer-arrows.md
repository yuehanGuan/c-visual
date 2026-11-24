【T-3.1】指针箭头视觉增强（只改 2 个文件，共 5 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `src/main/resources/web/style.css` 与 `src/main/resources/web/memory.js` 的相关行。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh、不要动其他文件**（会卡死/超范围，我自己验）。
✅ 允许：最后跑 1 次 `node --check src/main/resources/web/memory.js`。

## 背景（已核实，直接照做）
现状：指针箭头 `stroke-width:1.5`、`opacity:.85`，在 44px 右边距里几乎看不见；
箭头 marker 只有 7px；曲线只外扩 14px（`R+14`），像小钩子。
目标：加粗、提亮、箭头加大、曲线外扩更明显；**只改样式与三个常量，不改任何
坐标计算、不改 `data-ptr-*` 属性、不改颜色以外的结构**。

## 第 1 次调用：read 三个片段
- `style.css` 第 460–470 行
- `memory.js` 第 426–436 行（`renderPtrArrows` 开头）
- `memory.js` 第 528–536 行（`defs` 两个 marker）

## 第 2 次调用：edit #1 —— style.css 第 466–469 行（4 行整体替换）
原文：
```
.mem .mem-arrow { fill: none; stroke: #5ac8fa; stroke-width: 1.5; opacity: .85; }
.mem .mem-arrow-label { font: 10px var(--mono); fill: #8b93a7; }
.mem .ptr-arrow { stroke: #c792ea; }
.mem .ptr-miss { font: 11px var(--mono); fill: #c792ea; }
```
改为：
```
.mem .mem-arrow { fill: none; stroke: #7fd6ff; stroke-width: 2.4; opacity: .95; stroke-linecap: round; stroke-linejoin: round; }
.mem .mem-arrow-label { font: 10px var(--mono); fill: #a9b3c9; paint-order: stroke; stroke: #0e1016; stroke-width: 2.5px; stroke-linejoin: round; }
.mem .ptr-arrow { stroke: #d0a9ff; }
.mem .ptr-miss { font: 11px var(--mono); fill: #d0a9ff; }
```

## 第 3 次调用：edit #2 —— memory.js 第 434 行（只改一个常量）
原文：
```
    const ctrlX = Math.min(W - 4, R + 14);
```
改为：
```
    const ctrlX = Math.min(W - 8, R + 24);
```

## 第 4 次调用：edit #3 —— memory.js 两个 marker 的尺寸（第 531、533 行，两处同改）
把这两行里的 `markerWidth="7" markerHeight="7"` 全部改成
`markerWidth="9" markerHeight="9"`（只改属性值，别动 `viewBox` / `refX` / `refY`）。

## 第 5 次调用：edit #4 —— memory.js 两个 marker 的填充色
第 532 行 `<path ... fill="#5ac8fa"/>` → `fill="#7fd6ff"`
第 534 行 `<path ... fill="#c792ea"/>` → `fill="#d0a9ff"`

## 第 6 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js      → 期望：无输出、退出码 0
git diff --stat                                    → 期望：只有 style.css 与 memory.js 两个文件
```

## 收工
总结 ≤3 行：改了哪 5 处、node --check 结果、git diff --stat 的两行输出。不要写别的。
