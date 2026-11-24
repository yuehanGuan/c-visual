【T-3.3】压栈/返回过渡动画（只改 memory.js + style.css，共 6 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这两个文件的指定行；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh**；只允许最后的 `node --check` 与 `git diff --stat`。
✅ 已用无头 Chrome 验证过：push 时 `.frame.frame-in` 出现且 `document.getAnimations()` 为 1；
   pop 时 `.frame.frame-return`；无变化时 `data-frame-anim="none"`，首帧不闪。

## 目标
帧数变多（压栈）时，新帧从上方滑入淡入；帧数变少（返回）时，回到的那一帧绿色描边脉冲一下。
只在帧数变化的那一步触发；首次渲染（`prevStep` 为空）不动画；`prefers-reduced-motion` 时关闭。

## 第 1 次调用：read 三段
- `src/main/resources/web/memory.js` 第 290–310 行（`renderFrame` 开头 + `<g class="frame">`）
- 同文件 490–512 行（`render` 里 `prevFrames` 到 `renderFrame(...)` 调用）
- 同文件 555–570 行（`svg` 属性拼装处），以及 `style.css` 第 463–470 行

## 第 2 次调用：edit #1 —— `renderFrame` 签名（约第 294 行）
原文：
```
  function renderFrame(frame, prevFrame, y, width, heapAddrs) {
```
改为：
```
  function renderFrame(frame, prevFrame, y, width, heapAddrs, anim) {
```

## 第 3 次调用：edit #2 —— 帧分组加动画类（约第 306 行）
原文：
```
    parts.push(`<g class="frame" data-depth="${frame.depth}">`);
```
改为：
```
    const animCls = anim && frame.depth === 0 ? ' frame-' + anim : '';
    parts.push(`<g class="frame${animCls}" data-depth="${frame.depth}">`);
```

## 第 4 次调用：edit #3 —— `render` 里算 anim（约第 499–500 行）
原文：
```
    const prevFrames = (prevStep && prevStep.frames) || [];
    const prevByKey = indexPrevFrames(prevFrames);
```
改为：
```
    const prevFrames = (prevStep && prevStep.frames) || [];
    /* Push / pop transitions: a new innermost frame slides in, a return
     * flashes the frame we came back to.  No animation on the first paint. */
    const anim = !prevStep ? ''
      : (frames.length > prevFrames.length ? 'in'
        : (frames.length < prevFrames.length ? 'return' : ''));
    const prevByKey = indexPrevFrames(prevFrames);
```

## 第 5 次调用：edit #4 —— 传参（约第 505 行）
原文：
```
      const rendered = renderFrame(frame, prevByKey[frameKey(frame)], y, width, heapAddrs);
```
改为：
```
      const rendered = renderFrame(frame, prevByKey[frameKey(frame)], y, width, heapAddrs, anim);
```

## 第 6 次调用：edit #5 —— svg 上加 `data-frame-anim`（约第 565 行）
原文：
```
      ` data-ptr-drawn="${ptr.drawn}" data-ptr-miss="${ptr.miss}"` +
```
改为：
```
      ` data-ptr-drawn="${ptr.drawn}" data-ptr-miss="${ptr.miss}"` +
      ` data-frame-anim="${anim || 'none'}"` +
```

## 第 7 次调用：edit #6 —— style.css 在 `.mem .ptr-miss` 那行之后追加
```
.mem .frame.frame-in { animation: mem-frame-in .22s ease-out both; }
@keyframes mem-frame-in {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: translateY(0); }
}
.mem .frame.frame-return .frame-box { animation: mem-frame-return .4s ease-out both; }
@keyframes mem-frame-return {
  0% { stroke: #4ade80; stroke-width: 1.8; }
  100% { stroke: #262c3b; stroke-width: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .mem .frame.frame-in, .mem .frame.frame-return .frame-box { animation: none; }
}
```

## 第 8 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js    → 无输出、退出码 0
git diff --stat                                  → 只有 memory.js 与 style.css 两个文件
```

## 收工
总结 ≤2 行：6 处是否完成、两条检查结果。不要写别的。
