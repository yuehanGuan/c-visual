【P7-B】递归调用树（禁止探索，直接写）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz

⚠️ 硬规矩：
- **不要读 DEVLOG / PITFALLS / 其它文件**，下列信息已足够
- **第一次工具调用就直接创建文件**，不要先调查
- 每次工具调用 ≤40 行；总结 ≤2 行
- 撞了输出上限整轮就废了，所以要少说多写

## 已知事实（不用再查）
- `step.frames[0]` 是**最内层**帧；`frame.fn` 形如 `"fib(int)"`（含签名，不含参数值）
- 参数值在 `frame.vars` 里，形如 `{"name":"n","kind":"scalar","value":"3"}`
- 每一步的顶层字段：`{t:"step", n, line, frames}`

## 第 1 次调用 · 创建 src/main/resources/web/calltree.js（第 1 块，约 35 行）
全局 `CallTree`，实现 `buildTree(steps)`：
- 维护 `stack`（节点数组，对应当前路径）与 `roots`
- 每步取 `path = steps[i].frames.map(f => f.fn).reverse()`（最外层在前）
- 与 `stack.map(n=>n.fn)` 求最长公共前缀 `k`，把 `stack` 截断到 k
- 对 `path[k..]` 每个 fn：新建 `{fn, label, children:[], firstStep:i, lastStep:i, count:1}`，
  挂到 `stack` 末尾节点（或 roots），push 进 stack
- `label` 生成：取该步最内层帧 `frames[0].vars` 里前 2 个 `kind==="scalar"` 的变量，
  拼成 `fn + " " + vars.map(v=>v.name+"="+v.value).join(" ")`；
  没有 scalar 参数就只用 fn
- 同名相邻兄弟节点合并（count++）

## 第 2 次调用 · 追加渲染（第 2 块，约 35 行）
`CallTree.render(container, steps, currentIdx)`：
- `buildTree(steps)` 后递归渲染嵌套 `<div>`，每层 `padding-left:14px`
- 每行：`<div style="font:11.5px var(--mono);color:#8b93a7;padding:1px 0">▸ label ×count</div>`
- 当前路径（`currentIdx` 那一步 frames 的 fn 序列）上的节点颜色改成 `#5ac8fa`
- 有子节点才显示 `▸`
- 空时显示 `<p style="color:#8b93a7;font-size:12px">（无调用）</p>`

## 第 3 次调用 · index.html（2 处）
1. 在 `<script src="/timeline.js"></script>` 之后加 `<script src="/calltree.js"></script>`
2. 在 `<div id="timeline" class="timeline"></div>` **之前**插入：
```
<details style="border-top:1px solid var(--line);padding:6px 12px 10px">
  <summary style="font:12px var(--mono);color:var(--muted);cursor:pointer">调用树</summary>
  <div id="calltree" style="max-height:200px;overflow:auto;margin-top:6px"></div>
</details>
```

## 第 4 次调用 · app.js（2 处，各 1 行）
- `goTo()` 结尾加：`CallTree.render(document.getElementById('calltree'), state.steps, clamped);`
- `loadTrace()` 里加：`document.getElementById('calltree').innerHTML='';`

## 自测
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
然后打开 `#sample=recursion&run=12`，读 `document.getElementById('calltree').textContent`，
要求能看到 `fib(int) n=4` 以及它的子节点 `fib(int) n=3` / `fib(int) n=2`。

## 收工
总结 2 行：写出 `#calltree` 文本的前 120 字符 + smoke 结果。
