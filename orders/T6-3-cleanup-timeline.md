【T-6.3】清理旧轨迹与死代码（改 memory.js + style.css，并删除 timeline.js）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的常量区、`renderFrame` 头尾、`render()`、`renderHeap`/`renderArrows`；
`style.css` 的 `.timeline` 段；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check`、`./build.sh`、`rm`。
✅ 新堆面板已接线并实测；这两块旧代码已无人调用。

## 第 1 次调用：read 四段
- `memory.js` 第 30–40 行（`BLOCK_H` / `BLOCK_GAP` / `HEAP_GAP`）
- `renderFrame` 里 `const anchors = [];`、seq 分支的 `anchors.push`、`return { svg: ... }`
- `render()` 里 `const anchors = [];` 与 `rendered.anchors.forEach(...)`
- `renderHeap` 与 `renderArrows` 两个函数（约第 390–440 行）

## 第 2 次调用：edit #1 —— 删掉只给旧堆块用的常量
原文：
```
  const BLOCK_H = 22 + 24 + 16;
  const BLOCK_GAP = 10;
  const HEAP_GAP = 16;
  const STACK_ARRAY_EXTRA = 52;
```
改为：
```
  const STACK_ARRAY_EXTRA = 52;
```

## 第 3 次调用：edit #2 —— `renderFrame` 不再收集 anchors
原文：
```
    const anchors = [];
    const addrPoints = {};
    const ptrLinks = [];
    const parts = [];
```
改为：
```
    const addrPoints = {};
    const ptrLinks = [];
    const parts = [];
```

## 第 4 次调用：edit #3 —— 删掉 seq 分支里的锚点
原文：
```
      if (node && node.kind === 'seq' && node.dataAddr) {
        /* Start on the card border: cardW - 26 is where the address text ends,
         * so the arrow used to draw straight across "0xc00". */
        anchors.push({ addr: node.dataAddr, x: cardW - 14, y: rowY + ROW_H / 2, from: true });
        if (!heapAddrs[node.dataAddr]) {
```
改为：
```
      if (node && node.kind === 'seq' && node.dataAddr) {
        if (!heapAddrs[node.dataAddr]) {
```

## 第 5 次调用：edit #4 —— `renderFrame` 返回值去掉 anchors
原文：
```
    return { svg: parts.join(''), height: height, anchors: anchors, addrPoints: addrPoints, ptrLinks: ptrLinks };
```
改为：
```
    return { svg: parts.join(''), height: height, addrPoints: addrPoints, ptrLinks: ptrLinks };
```

## 第 6 次调用：edit #5 —— `render()` 去掉 anchors 收集
原文：
```
    const body = [];
    const anchors = [];
    const addrPoints = {};
```
改为：
```
    const body = [];
    const addrPoints = {};
```

## 第 7 次调用：edit #6 —— `render()` 去掉 collect 调用
原文：
```
      body.push(rendered.svg);
      rendered.anchors.forEach((a) => anchors.push(a));
```
改为：
```
      body.push(rendered.svg);
```

## 第 8 次调用：edit #7 —— 删除 `renderHeap` 与 `renderArrows` 两个函数
从
```
  /* Heap blocks drawn under the stack frames. */
  function renderHeap(heap, prevHeap, y, width) {
```
到 `renderArrows` 的结尾
```
      parts.push(`<text class="mem-arrow-label" x="${lx}" y="${ly}" text-anchor="middle">${escapeHtml(addrShort(a.addr))}</text>`);
    });
    return parts.join('');
  }
```
整段删除（保留它后面的 `/* Arrows from pointer variables ... */` 注释与 `MAX_PTR_ARROWS`）。
用 read 确认结束位置后再删，别误删 `renderPtrArrows`。

## 第 9 次调用：edit #8 —— style.css 删除 `.timeline` 整段
从
```
/* ---------- timeline ---------- */
.timeline { flex: 0 0 auto; padding: 6px 12px 10px; border-top: 1px solid var(--line); max-height: 160px; overflow: auto; }
```
到最后一行 `.timeline .tl-tick.current { stroke: #c3e88d; }`，整段删除（保留空行）。

## 第 10 次调用：删除 timeline.js
```
rm src/main/resources/web/timeline.js
```

## 第 11 次调用：检查（只允许这四条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
grep -n "renderHeap\|renderArrows\|timeline\|BLOCK_H\|HEAP_GAP" src/main/resources/web/memory.js src/main/resources/web/style.css src/main/resources/web/index.html → 期望 0 行
ls src/main/resources/web/timeline.js            → 应不存在
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：改动是否完成、四条检查结果。不要写别的。
