【T-6.2】用"堆（数据区）"面板替换"轨迹"（改 index.html + app.js，共 5 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 的 vars-pane 区、`app.js` 里 `timeline` 的三处引用；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
✅ 组件 `Memory.renderHeapPanel(container, step, prevStep)` 已在上一单实现并实测。

## 第 1 次调用：read 三段
- `index.html` 第 58–70 行（`#timeline` 那段）与第 108–114 行（script 列表）
- `app.js` 里 `el.timeline` 的 3 处引用（约 329、346、520 行）
- `app.js` 的 `el.samples.addEventListener('change', ...)` 块

## 第 2 次调用：edit #1 —— index.html：轨迹 div 换成堆面板
原文：
```
    <div id="timeline" class="timeline"></div>
```
改为：
```
    <div class="heap-panel">
      <div class="heap-head">堆（数据区）</div>
      <div id="heap" class="heap-body"><p class="empty">（当前没有堆数据）</p></div>
    </div>
```

## 第 3 次调用：edit #2 —— index.html：去掉 timeline.js
原文：
```
<script src="/timeline.js"></script>
```
（整行删除，保留前后 script 行）

## 第 4 次调用：edit #3 —— app.js：空步骤时的占位
原文：
```
      el.timeline.innerHTML = '<div class="tl-title">轨迹</div><p class="empty">（无轨迹数据）</p>';
```
改为：
```
      el.heap.innerHTML = '<p class="empty">（当前没有堆数据）</p>';
```

## 第 5 次调用：edit #4 —— app.js：goTo 里改渲染堆面板
原文：
```
    Timeline.render(el.timeline, state.steps, clamped);
```
改为：
```
    Memory.renderHeapPanel(el.heap, step, prev);
```

## 第 6 次调用：edit #5 —— app.js：init 里换元素引用
原文：
```
    el.timeline = $('timeline');
```
改为：
```
    el.heap = $('heap');
```

## 第 7 次调用：edit #6 —— app.js：切示例时清掉堆面板
原文：
```
      el.frames.innerHTML = '<p class="empty">点右上角「运行 ▶」开始</p>';
      el.calltree.innerHTML = '';
```
改为：
```
      el.frames.innerHTML = '<p class="empty">点右上角「运行 ▶」开始</p>';
      el.heap.innerHTML = '<p class="empty">（当前没有堆数据）</p>';
      el.calltree.innerHTML = '';
```

## 第 8 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
grep -n "timeline" src/main/resources/web/app.js src/main/resources/web/index.html → 期望 0 行
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：6 处是否完成、检查结果。不要写别的。
