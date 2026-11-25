【T-6.1b】堆面板改成两行式（只改 memory.js + style.css，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderHeapPanel` 与 `style.css` 末尾的 `.heap-*` 段；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测）
现在每个堆块挤成一行：`v  int[5] · cap 8 · …` 的地址被省略号吃掉，格子只有 6 个。
改成两行：第一行「变量名 + 类型/数量/容量/地址」，第二行整行放格子（约 11 个）。

## 第 1 次调用：read 两段
- `memory.js` 的 `function renderHeapPanel(container, step, prevStep) {` 全段
- `style.css` 的 `/* ---------- flat heap panel ---------- */` 段

## 第 2 次调用：edit #1 —— 计算格子数不再给 meta 预留 250px
原文：
```
    const room = Math.max(4, Math.floor(((container.clientWidth || 520) - 250) / (CELL_W + CELL_GAP)));
```
改为：
```
    const room = Math.max(4, Math.floor(((container.clientWidth || 520) - 24) / (CELL_W + CELL_GAP)));
```

## 第 3 次调用：edit #2 —— 行模板改成两行
原文：
```
      return '<div class="heap-row" data-addr="' + escapeHtml(b.addr || '') + '">' +
        '<span class="heap-var">' + escapeHtml(name) + '</span>' +
        '<span class="heap-meta">' +
        escapeHtml((b.type || '?') + '[' + count + ']' + cap + ' · ' + addrShort(b.addr)) +
        '</span>' +
        '<svg class="heap-cells" width="' + cells.width + '" height="44" viewBox="0 -4 ' + cells.width + ' 44">' +
        cells.svg + '</svg>' +
        '</div>';
```
改为：
```
      return '<div class="heap-row" data-addr="' + escapeHtml(b.addr || '') + '">' +
        '<div class="heap-line">' +
        '<span class="heap-var">' + escapeHtml(name) + '</span>' +
        '<span class="heap-meta">' +
        escapeHtml((b.type || '?') + '[' + count + ']' + cap + ' · ' + addrShort(b.addr)) +
        '</span>' +
        '</div>' +
        '<svg class="heap-cells" width="' + cells.width + '" height="44" viewBox="0 -4 ' + cells.width + ' 44">' +
        cells.svg + '</svg>' +
        '</div>';
```

## 第 4 次调用：edit #3 —— CSS 两行布局
原文：
```
.heap-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
.heap-var { flex: 0 0 56px; font: 12px var(--mono); color: var(--accent); text-align: right; overflow: hidden; text-overflow: ellipsis; }
.heap-meta { flex: 1 1 auto; min-width: 0; font: 11.5px var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.heap-cells { flex: 0 0 auto; }
```
改为：
```
.heap-row { padding: 4px 0 6px; border-bottom: 1px dashed rgba(255, 255, 255, .05); }
.heap-row:last-child { border-bottom: 0; }
.heap-line { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.heap-var { font: 12px var(--mono); color: var(--accent); white-space: nowrap; }
.heap-meta { font: 11.5px var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.heap-cells { display: block; margin-top: 3px; }
```

## 第 5 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
