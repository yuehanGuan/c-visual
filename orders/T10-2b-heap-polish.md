【T-10.2b】堆面板细节：地址对齐、去掉 `?`、字段格式（只改 memory.js，共 4 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderHeapPanel` 与 `renderPtrArrows`/`render()` 调用处；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测链表截图）
现在显示：
```
head Node · 0x210            ← 地址被截短
v=2 · next=→ 0x100631a30     ← next 却是全地址，对不上
?   Node · 0xa30             ← 没有变量指向它时显示 ?
```
且栈上 `head` 行右侧有个 `?`（ptr 目标不在栈变量里）——现在堆面板里有这个地址了，不该再标 miss。

## 第 1 次调用：read 三段
- `memory.js` 的 `renderHeapPanel` 里 record 分支（`if (b.kind === 'record')`）
- `renderPtrArrows` 里 `if (!target) {` 那段
- `render()` 里 `const ptr = renderPtrArrows(...)`

## 第 2 次调用：edit #1 —— record 行：全地址 + 无主时不显示 `?`
原文：
```
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
```
改为：
```
      const owner = nameByAddr[b.addr] || ptrNameByTarget[b.addr] || '';
      if (b.kind === 'record') {
        const fields = (b.fields || []).slice(0, 4).map((f) => {
          const label = f.name || '?';
          return escapeHtml(f.kind === 'ptr' ? label + ' ' + textOf(f) : label + '=' + textOf(f));
        }).join(' · ');
        return '<div class="heap-row" data-addr="' + escapeHtml(b.addr || '') + '">' +
          '<div class="heap-line">' +
          '<span class="heap-var">' + escapeHtml(owner) + '</span>' +
          '<span class="heap-meta">' +
          escapeHtml((b.type || '?') + ' · ' + (b.addr || '') + ' · ' + (b.fields || []).length + ' 字段') +
          '</span>' +
          '</div>' +
          '<div class="heap-fields">' + fields + '</div>' +
          '</div>';
      }
```

## 第 3 次调用：edit #2 —— `renderPtrArrows` 接受堆地址集合
原文：
```
  function renderPtrArrows(ptrLinks, addrPoints, width, height) {
```
改为：
```
  function renderPtrArrows(ptrLinks, addrPoints, width, height, heapAddrs) {
```

## 第 4 次调用：edit #3 —— 目标是堆对象时不画 miss
原文：
```
      if (!target) {
        miss++;
```
改为：
```
      if (!target) {
        // Pointer into a heap object: it is shown in the flat heap panel, so
        // a "?" here would be a lie.
        if (heapAddrs && heapAddrs[link.target]) return;
        miss++;
```

## 第 5 次调用：edit #4 —— 传参
原文：
```
    const ptr = renderPtrArrows(ptrLinks, addrPoints, width, height);
```
改为：
```
    const ptr = renderPtrArrows(ptrLinks, addrPoints, width, height, heapAddrs);
```

## 第 6 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
