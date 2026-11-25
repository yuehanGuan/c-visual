【T-6.1】新增"堆区平面视图"组件（只改 memory.js + style.css，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `render()` 与 `renderCells` 附近；不读别的文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 目标（用户要求：砍掉"轨迹"，用那块区域平铺显示堆数据）
新增 `Memory.renderHeapPanel(container, step, prevStep)`：每个堆块一行（HTML），
行内是 `变量名 类型[数量] · cap N · 地址` + 横向排列的格子（复用 `renderCells`）。
**这一步不改 UI 接线**，只加组件；同时先把栈视图里的堆块/箭头停掉，
让堆从一开始就只在面板里出现。

## 第 1 次调用：read 三段
- `memory.js` 第 10–36 行（常量区）
- `memory.js` 的 `render()` 里 `if (frames.length) y -= FRAME_GAP;` 到 `body.push(renderArrows(anchors));`
- `memory.js` 末尾 `return { render, escapeHtml, addrShort, textOf };`

## 第 2 次调用：edit #1 —— `render()` 里不再画堆块与堆箭头
原文：
```
    if (frames.length) y -= FRAME_GAP;
    const heap = renderHeap(step && step.heap, prevStep && prevStep.heap, y + HEAP_GAP, width);
    if (heap.height > 0) {
      body.push(heap.svg);
      heap.anchors.forEach((a) => anchors.push(a));
      y += HEAP_GAP + heap.height;
    }
    const height = y + 8;

    body.push(renderArrows(anchors));
```
改为：
```
    if (frames.length) y -= FRAME_GAP;
    /* The heap now lives in the flat panel below the stack (renderHeapPanel);
     * the canvas only draws frames and pointer arrows. */
    const height = y + 8;
```

## 第 3 次调用：edit #2 —— 新增 `renderHeapPanel`（放在 `function render(container, step, prevStep) {` 之前）
```
  /* Flat heap view: one row per allocated buffer, labelled with the variable
   * whose dataAddr owns it.  Replaces the in-canvas heap blocks + arrows. */
  function renderHeapPanel(container, step, prevStep) {
    if (!container) return;
    const blocks = (step && step.heap) || [];
    if (!blocks.length) {
      container.innerHTML = '<p class="empty">（当前没有堆数据）</p>';
      return;
    }
    const nameByAddr = {};
    ((step && step.frames) || []).forEach((frame) => {
      ((frame && frame.vars) || []).forEach((node) => {
        if (node && node.dataAddr) nameByAddr[node.dataAddr] = node.name;
      });
    });
    const prevByAddr = {};
    ((prevStep && prevStep.heap) || []).forEach((b) => { if (b && b.addr) prevByAddr[b.addr] = b; });
    const room = Math.max(4, Math.floor(((container.clientWidth || 520) - 250) / (CELL_W + CELL_GAP)));
    const rows = blocks.map((b) => {
      const prev = b.addr ? prevByAddr[b.addr] : null;
      const cells = renderCells(b.items, b.capacity, prev ? prev.items : null, room);
      const count = b.count !== undefined ? b.count : (b.items || []).length;
      const cap = b.capacity === undefined ? '' : ' · cap ' + b.capacity;
      const name = nameByAddr[b.addr] || '?';
      return '<div class="heap-row" data-addr="' + escapeHtml(b.addr || '') + '">' +
        '<span class="heap-var">' + escapeHtml(name) + '</span>' +
        '<span class="heap-meta">' +
        escapeHtml((b.type || '?') + '[' + count + ']' + cap + ' · ' + addrShort(b.addr)) +
        '</span>' +
        '<svg class="heap-cells" width="' + cells.width + '" height="44" viewBox="0 -4 ' + cells.width + ' 44">' +
        cells.svg + '</svg>' +
        '</div>';
    });
    container.innerHTML = rows.join('');
  }

```

## 第 4 次调用：edit #3 —— 导出
原文：
```
  return { render, escapeHtml, addrShort, textOf };
```
改为：
```
  return { render, renderHeapPanel, escapeHtml, addrShort, textOf };
```

## 第 5 次调用：edit #4 —— style.css 末尾追加（堆面板样式）
```
/* ---------- flat heap panel ---------- */
.heap-panel { flex: 0 0 auto; border-top: 1px solid var(--line); max-height: 200px; overflow: auto; }
.heap-head { font: 12px var(--mono); color: var(--muted); padding: 6px 12px 2px; }
.heap-body { padding: 0 12px 8px; }
.heap-body .empty { margin: 4px 0 2px; font-size: 12px; color: var(--muted); }
.heap-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; }
.heap-var { flex: 0 0 56px; font: 12px var(--mono); color: var(--accent); text-align: right; overflow: hidden; text-overflow: ellipsis; }
.heap-meta { flex: 1 1 auto; min-width: 0; font: 11.5px var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.heap-cells { flex: 0 0 auto; }
.heap-cells text { font: 11px var(--mono); fill: var(--text); }
.heap-cells text.cell-idx { font-size: 9.5px; fill: #565e72; }
.heap-cells rect { fill: var(--panel-2); stroke: var(--line); }
.heap-cells rect.ghost { fill: none; stroke-dasharray: 3 3; stroke: #2c3243; }
.heap-cells rect.changed { stroke: #f5b942; fill: var(--changed); }
```

## 第 6 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
grep -n "renderHeapPanel" src/main/resources/web/memory.js → 至少 2 处（定义 + 导出）
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：改动是否完成、检查结果。不要写别的。
