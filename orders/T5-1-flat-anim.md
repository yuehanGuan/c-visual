【T-5.1】压栈/返回动画平面化（改 2 个文件，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderFrame` 头部、`style.css` 的 `mem-frame-*` 两段；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/memory.js` 与 `./build.sh`。

## 目标（用户反馈：动画太粗糙，要更平面化、更好懂）
- 入场：少位移（−14px → −6px）、cubic-bezier 缓动，保留淡入
- 新增**左侧 3px 强调条**（accent 色），只在"这一步变化的那一帧"出现，从上方长出
- 返回：去掉绿色发光描边，改成「accent 描边 + 轻微底色」淡回常态
- 帧头 `栈深 N` 前面加方向标签：`压栈 · 栈深 0` / `返回 · 栈深 0`

## 第 1 次调用：read 两段
- `memory.js` 的 `function renderFrame(...)` 前 20 行（`<g class="frame...">` 到 `frame-depth`）
- `style.css` 里 `.mem .frame.frame-in` 到 `@media (prefers-reduced-motion` 整段

## 第 2 次调用：edit #1 —— memory.js：强调条 + 方向标签
原文：
```
    parts.push(`<rect class="frame-box" x="12" y="${y}" width="${cardW - 24}" height="${height}" rx="8"/>`);
    parts.push(`<text class="frame-fn" x="24" y="${y + 22}">${escapeHtml(frame.fn || '?')}</text>`);
    parts.push(`<text class="frame-depth" x="${cardW - 24}" y="${y + 22}" text-anchor="end">栈深 ${frame.depth}</text>`);
```
改为：
```
    parts.push(`<rect class="frame-box" x="12" y="${y}" width="${cardW - 24}" height="${height}" rx="8"/>`);
    if (anim && frame.depth === 0) {
      parts.push(`<rect class="frame-accent" x="12" y="${y}" width="3" height="${height}" rx="1.5"/>`);
    }
    parts.push(`<text class="frame-fn" x="24" y="${y + 22}">${escapeHtml(frame.fn || '?')}</text>`);
    const animTag = anim && frame.depth === 0 ? (anim === 'in' ? '压栈 · ' : '返回 · ') : '';
    parts.push(`<text class="frame-depth" x="${cardW - 24}" y="${y + 22}" text-anchor="end">${animTag}栈深 ${frame.depth}</text>`);
```

## 第 3 次调用：edit #2 —— style.css：替换入场动画
原文：
```
.mem .frame.frame-in { animation: mem-frame-in .22s ease-out both; }
@keyframes mem-frame-in {
  from { opacity: 0; transform: translateY(-14px); }
  to { opacity: 1; transform: translateY(0); }
}
```
改为：
```
.mem .frame.frame-in { animation: mem-frame-in .24s cubic-bezier(.2, .7, .3, 1) both; }
@keyframes mem-frame-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
.mem .frame-accent { fill: var(--accent); animation: mem-accent .3s ease-out both; transform-box: fill-box; transform-origin: top; }
@keyframes mem-accent {
  from { transform: scaleY(.15); opacity: .55; }
  to { transform: scaleY(1); opacity: 1; }
}
```

## 第 4 次调用：edit #3 —— style.css：替换返回动画与 reduced-motion
原文：
```
.mem .frame.frame-return .frame-box { animation: mem-frame-return .4s ease-out both; }
@keyframes mem-frame-return {
  0% { stroke: #4ade80; stroke-width: 1.8; }
  100% { stroke: #262c3b; stroke-width: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .mem .frame.frame-in, .mem .frame.frame-return .frame-box { animation: none; }
}
```
改为：
```
.mem .frame.frame-return .frame-box { animation: mem-frame-return .38s ease-out both; }
@keyframes mem-frame-return {
  0% { stroke: var(--accent); fill: #18242e; }
  100% { stroke: var(--line); fill: #131722; }
}
@media (prefers-reduced-motion: reduce) {
  .mem .frame.frame-in, .mem .frame.frame-return .frame-box, .mem .frame-accent { animation: none; }
}
```

## 第 5 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
grep -n "4ade80" src/main/resources/web/style.css → 期望 0 行（旧的绿色已移除）
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：3 处是否完成、三条检查结果。不要写别的。
