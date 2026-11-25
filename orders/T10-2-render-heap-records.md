【T-10.2】堆面板渲染记录对象（只改 memory.js + style.css，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderHeapPanel`、`style.css` 的 `.heap-*` 段；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
✅ tracer 已输出 `kind:"record"` 的堆块：`{addr, type:"Node", kind:"record", fields:[{name:"v",...},{name:"next",kind:"ptr",target:"0x..."}]}`。

## 目标
堆面板里，记录对象（链表/树节点）显示为：
```
head   Node · 0x290
       v=2 · next=→ 0x9ab0
```
变量名取自"谁指向它"（`ptrNameByTarget`），字段用现有的 `textOf` 渲染。

## 第 1 次调用：read 两段
- `memory.js` 的 `function renderHeapPanel(container, step, prevStep) {` 全段
- `style.css` 的 `.heap-row` / `.heap-line` / `.heap-meta` / `.heap-cells` 规则

## 第 2 次调用：edit #1 —— 增加"谁指向它"的映射
原文：
```
    const prevByAddr = {};
    ((prevStep && prevStep.heap) || []).forEach((b) => { if (b && b.addr) prevByAddr[b.addr] = b; });
```
改为：
```
    const ptrNameByTarget = {};
    ((step && step.frames) || []).forEach((frame) => {
      ((frame && frame.vars) || []).forEach((node) => {
        if (node && node.kind === 'ptr' && node.target) ptrNameByTarget[node.target] = node.name;
      });
    });
    const prevByAddr = {};
    ((prevStep && prevStep.heap) || []).forEach((b) => { if (b && b.addr) prevByAddr[b.addr] = b; });
```

## 第 3 次调用：edit #2 —— 记录块分支
原文：
```
    const rows = blocks.map((b) => {
      const prev = b.addr ? prevByAddr[b.addr] : null;
      const cells = renderCells(b.items, b.capacity, prev ? prev.items : null, room);
      const count = b.count !== undefined ? b.count : (b.items || []).length;
      const cap = b.capacity === undefined ? '' : ' · cap ' + b.capacity;
      const name = nameByAddr[b.addr] || '?';
```
改为：
```
    const rows = blocks.map((b) => {
      const prev = b.addr ? prevByAddr[b.addr] : null;
      const owner = nameByAddr[b.addr] || ptrNameByTarget[b.addr] || '?';
      if (b.kind === 'record') {
        const fields = (b.fields || []).slice(0, 4).map((f) => escapeHtml((f.name || '?') + '=' + textOf(f))).join(' · ');
        return '<div class="heap-row" data-addr="' + escapeHtml(b.addr || '') + '">' +
          '<div class="heap-line">' +
          '<span class="heap-var">' + escapeHtml(owner) + '</span>' +
          '<span class="heap-meta">' + escapeHtml((b.type || '?') + ' · ' + addrShort(b.addr)) + '</span>' +
          '</div>' +
          '<div class="heap-fields">' + fields + '</div>' +
          '</div>';
      }
      const cells = renderCells(b.items, b.capacity, prev ? prev.items : null, room);
      const count = b.count !== undefined ? b.count : (b.items || []).length;
      const cap = b.capacity === undefined ? '' : ' · cap ' + b.capacity;
      const name = owner;
```

## 第 4 次调用：edit #3 —— style.css 加字段行样式
在 `.heap-cells { display: block; margin-top: 3px; }` 之后加一行：
```
.heap-fields { font: 11.5px var(--mono); color: #c3e88d; padding: 2px 0 0 4px; }
```

## 第 5 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
