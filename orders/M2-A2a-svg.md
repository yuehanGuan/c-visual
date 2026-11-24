【M2-A2a】SVG 内存图骨架（分 6 个小步做完，每步一次工具调用）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz

⚠️ 硬性要求（上次你被 8192 token 输出上限截断而失败）：
- 每次工具调用的内容 ≤ 40 行，**绝对不要一次写完整文件**
- 不要复述代码、不要解释设计
- 最后总结 ≤ 3 行

按顺序做完 6 步，每步停下来再做下一步：

第 1 步 · tracer/tracer.py（改 1 处，2 行）
`_buffer_addr()` 返回前加守卫：number 为 None、等于 0、或 >= 0xFFFFFFFFFFFF0000 时 return None。

第 2 步 · 新建 src/main/resources/web/memory.js（第 1 块，约 35 行）
文件头 + 工具函数：`escapeHtml`、`addrShort(a)`（`0x…` + 末 3 位）、`textOf(node)`（按 kind 取值文本）。

第 3 步 · memory.js 追加（第 2 块，约 40 行）
`renderSlot(...)`：生成一个变量行 `<g class="slot" data-var="名字">`，行高 26：
名字 x=24、类型 x=110、值 x=200、地址右对齐到帧右边-12；值超 28 字符截断加 `…`；
与上一步同名字变量值不同则加 class `changed`。

第 4 步 · memory.js 追加（第 3 块，约 40 行）
`renderFrame(...)`：`<g class="frame" data-depth="N">`，外框 rect（x=12, 宽 W-24, rx=8），
帧高 = 34 + 26*变量数 + 10，标题栏写函数名与 `栈深 N`，然后逐个 slot。
`Memory.render(container, step, prevStep)`：算 W = container.clientWidth，按 frames 从上到下排，
帧间隔 8；顶部一行写「栈」；输出 `<svg class="mem" viewBox="0 0 W H">` 到 container.innerHTML。

第 5 步 · 接线（各 1–2 行）
- index.html：`views.js` 之后加 `<script src="/memory.js"></script>`
- app.js：`goTo()` 里把 `el.frames.innerHTML = Vars.renderFrames(...)` 改成 `Memory.render(el.frames, step, prev)`

第 6 步 · style.css 追加 `.mem` 规则（约 25 行）
深色底、等宽字体、`--accent`/`--line`/`--muted` 复用现有变量；
`.mem .frame rect` 描边；`.mem .slot.changed rect` 描边 `#f5b942`；
`.mem text` 用 `font-family: var(--mono)`，字号 12–13；帧标题用 `--accent`。

## 验收
1. `./build.sh` 通过；`./smoke.sh` 输出 PASS
2. 打开页面运行 vector 示例：右侧是 SVG，能看到 1 个帧、`v` 与 `i` 两行、每行带简写地址
3. 递归示例：多帧垂直排列，函数名与栈深正确

## 收工
DEVLOG.md §7 顶部加 3 行日志；总结 3 行（写「A2a 完成」或「卡在第 N 步」）。
