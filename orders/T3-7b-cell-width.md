【T-3.7b】单元格上限按可用宽度算（只改 memory.js，3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderCells` 与两处调用；不读别的文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/memory.js` 和 `./build.sh`。

## 背景
T-3.7 把画布单元格固定截到 24 个，但 640px 宽的容器只放得下约 11 个，
第 13 个起被 SVG 裁掉，看着像画歪了。改成按可用宽度算列数。

## 第 1 次调用：read 三段
- `memory.js` 第 344–352 行（`renderCells` 开头）
- 第 328–332 行（`renderFrame` 里的调用）
- 第 390–394 行（`renderHeap` 里的调用）

## 第 2 次调用：edit #1 —— `renderCells` 接收列数上限
原文：
```
  function renderCells(items, capacity, prevItems) {
    const raw = Array.isArray(items) ? items : [];
    /* Huge arrays must not become a 10k-pixel-wide row: draw the head only. */
    const list = raw.length > MAX_CELLS ? raw.slice(0, MAX_CELLS) : raw;
```
改为：
```
  function renderCells(items, capacity, prevItems, maxCells) {
    const raw = Array.isArray(items) ? items : [];
    /* Huge arrays must not become a 10k-pixel-wide row: draw the head only. */
    const limit = Math.max(4, Math.floor(maxCells || MAX_CELLS));
    const list = raw.length > limit ? raw.slice(0, limit) : raw;
```

## 第 3 次调用：edit #2 —— 栈上数组的调用
原文：
```
          const cells = renderCells(node.items, node.capacity, prev ? prev.items : null);
```
改为：
```
          const cells = renderCells(node.items, node.capacity,
            prev ? prev.items : null, (cardW - 40) / (CELL_W + CELL_GAP));
```

## 第 4 次调用：edit #3 —— 堆块的调用
原文：
```
      const cells = renderCells(b.items, b.capacity, prev ? prev.items : null);
```
改为：
```
      const cells = renderCells(b.items, b.capacity,
        prev ? prev.items : null, (width - 40) / (CELL_W + CELL_GAP));
```

## 第 5 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：3 处是否完成、两条检查结果。不要写别的。
