【P7-A】递归调用树（新增 calltree.js + 接两个线）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤35 行；**不要改 style.css**（样式写进 JS 里）；总结 ≤3 行。

## 目标
在右侧面板加一块可折叠的"调用树"，把递归的调用结构画出来：
`fib(4)` 下面挂着 `fib(3)` 和 `fib(2)`，以此类推，当前执行路径高亮。

## 第 1 步 · 新建 src/main/resources/web/calltree.js（约 55 行）
全局对象 `CallTree`，提供 `CallTree.render(container, steps, currentIdx)`。

### 构建树（用栈模拟）
- 每一步有 `step.frames`，其中 `frames[0]` 是**最内层**。取
  `path = step.frames.map(f => f.fn).reverse()`（最外层在前）
- 维护 `stack`（节点数组，对应当前路径）与 `roots`
- 对每一步：
  1. 计算 `path` 与 `stack.map(n => n.fn)` 的**最长公共前缀长度** `k`
  2. 把 `stack` 截断到长度 `k`
  3. 对 `path[k..]` 里每个函数名：新建节点 `{fn, children: [], firstStep: i, lastStep: i, count: 1}`，
     挂到 `stack` 最后一个节点（或 roots）上，然后 push 进 `stack`
  4. 更新 `stack` 中所有节点的 `lastStep = i`
- 节点若与上一个兄弟节点同名，则合并（`count++`），避免 `fib(1)` 刷屏

### 渲染（HTML，内联样式，不依赖 CSS 文件）
- 用嵌套 `<div>`，每层 `padding-left: 14px`
- 每个节点一行：`▸ fn  ×count`，等宽字体 11.5px
- 当前步骤路径上的节点：颜色 `#5ac8fa`；其它 `#8b93a7`
- 只在有子节点时显示 `▸`
- 容器为空时显示 `<p>（无调用）</p>`

## 第 2 步 · index.html（2 处，约 6 行）
在 `timeline.js` 之后加 `<script src="/calltree.js"></script>`；
在 `#timeline` 之前加：
```
<details class="calltree" style="border-top:1px solid var(--line);padding:6px 12px 10px">
  <summary style="font:12px var(--mono);color:var(--muted);cursor:pointer">调用树</summary>
  <div id="calltree" style="max-height:200px;overflow:auto;margin-top:6px"></div>
</details>
```

## 第 3 步 · app.js（约 4 行）
`goTo()` 里：`CallTree.render(document.getElementById('calltree'), state.steps, clamped)`；
`loadTrace` 里清空该容器。

## 自测（必须量出来）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
打开 `#sample=recursion&run=12`，展开「调用树」，确认：
- 根节点是 `fib(4)`
- 它的子节点里有 `fib(3)` 和 `fib(2)`
- 高亮节点随步进变化

用 CDP 读 `#calltree` 的文本，写进总结（截取前 120 字符）。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（含 `#calltree` 文本片段）。
