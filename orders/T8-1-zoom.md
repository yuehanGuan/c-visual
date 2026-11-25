【T-8.1】深栈不再被挤扁 + 记忆视图缩放（改 index.html、app.js、style.css，共 6 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 的 vars-pane 头、`app.js` 的 goTo/bind/init、`style.css` 的 `.frames` 与文件末尾；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测）
`f(40)` 递归（42 帧）时：
- 调用树长到 **840px**，把「变量与栈帧」挤到 **24px**
- SVG 的 `flex-shrink: 1` 又把它压到 **高度 0**（`svgCssH: 0px`）
所以看起来"栈深了图就特别小"。修：调用树限高内部滚动、记忆区保底 220px、SVG 不参与收缩；
再加 100%–200% 缩放（缩放 SVG 视口、viewBox 不变，字号/格子一起放大，面板可滚动）。

## 第 1 次调用：read 三段
- `index.html` 第 58–62 行（`<div class="pane-head">`）
- `app.js` 的 `goTo` 里 `Memory.render(el.frames, step, prev);`、`bind()` 里 `el.clearRuns` 附近、`init()` 里 `$('dialogCancel')` 附近
- `style.css` 的 `.frames { ... }` 与文件末尾

## 第 2 次调用：edit #1 —— index.html：pane-head 加缩放控件
原文：
```
    <div class="pane-head">
      <span>变量与栈帧</span>
      <span id="engineTag" class="hint"></span>
    </div>
```
改为：
```
    <div class="pane-head">
      <span>变量与栈帧</span>
      <span class="pane-right">
        <span class="zoom">
          <button id="zoomOut" class="ghost" title="缩小">−</button>
          <span id="zoomLabel" class="zoom-label">100%</span>
          <button id="zoomIn" class="ghost" title="放大">＋</button>
        </span>
        <span id="engineTag" class="hint"></span>
      </span>
    </div>
```

## 第 3 次调用：edit #2 —— style.css 末尾追加（布局修正 + 缩放控件样式）
```
/* ---------- memory pane sizing / zoom ---------- */
.frames { min-height: 220px; }
.frames .mem { flex: 0 0 auto; }
.ct-panel #calltree { max-height: 180px; overflow: auto; }
.pane-right { display: flex; align-items: center; gap: 10px; }
.zoom { display: flex; align-items: center; gap: 2px; }
.zoom button { padding: 0 6px; font-size: 13px; line-height: 18px; }
.zoom-label { font: 11.5px var(--mono); color: var(--muted); min-width: 36px; text-align: center; }
```

## 第 4 次调用：edit #3 —— app.js：缩放状态与函数（放在 `let dialogOnOk = null;` 之后）
```
  const ZOOM_KEY = 'cppviz.zoom';
  const ZOOM_MIN = 100;
  const ZOOM_MAX = 200;
  const ZOOM_STEP = 25;
  let zoom = 100;

  /* Scale the memory SVG's viewport; the viewBox is unchanged, so text and
   * cells scale together and the pane simply scrolls. */
  function applyZoom() {
    const svg = el.frames && el.frames.querySelector('svg.mem');
    if (!svg) return;
    const w = Number(svg.getAttribute('width')) || 0;
    const h = Number(svg.getAttribute('height')) || 0;
    if (!w || !h) return;
    svg.style.width = Math.round(w * zoom / 100) + 'px';
    svg.style.height = Math.round(h * zoom / 100) + 'px';
    if (el.zoomLabel) el.zoomLabel.textContent = zoom + '%';
  }

  function setZoom(next) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch (ignored) {
      // private mode: zoom still works for this session
    }
    applyZoom();
  }

  function initZoom() {
    try {
      const saved = Number(localStorage.getItem(ZOOM_KEY));
      if (Number.isFinite(saved) && saved >= ZOOM_MIN && saved <= ZOOM_MAX) zoom = saved;
    } catch (ignored) {
      // default 100%
    }
    if (el.zoomLabel) el.zoomLabel.textContent = zoom + '%';
  }

```

## 第 5 次调用：edit #4 —— app.js：goTo 渲染后应用缩放
原文：
```
    Memory.render(el.frames, step, prev);
```
改为：
```
    Memory.render(el.frames, step, prev);
    applyZoom();
```

## 第 6 次调用：edit #5 —— app.js：bind 里挂按钮（`el.clearRuns` 那段之后）
在
```
    el.clearRuns.addEventListener('click', () => {
```
之前插入：
```
    el.zoomOut.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
    el.zoomIn.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
```
（就放在 bind() 内、`el.clearRuns` 那段上面一行）

## 第 7 次调用：edit #6 —— app.js：init 补引用与初始化
- `    el.frames = $('frames');` 之后加：
```
    el.zoomIn = $('zoomIn');
    el.zoomOut = $('zoomOut');
    el.zoomLabel = $('zoomLabel');
```
- `    initStdinSets();` 之后加一行 `    initZoom();`

## 第 8 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
grep -n "applyZoom\|initZoom\|ZOOM_KEY" src/main/resources/web/app.js → 至少 6 处
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：6 处是否完成、检查结果。不要写别的。
