【M2-A2b】堆区 + 连续格子 + 指针箭头（改 2 个文件：memory.js / style.css，另加 app.js 5 行）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz

⚠️ 硬性要求（你之前在单轮输出 8192 token 处失败过）：
- 每次工具调用 ≤ 40 行；**不要一次重写整个 memory.js**，用 edit 追加
- 不要复述代码、不要解释设计；总结 ≤3 行

## 现状
`Memory.render` 已能画栈帧（矩形 + 每个变量一行）。但现在 `seq` 变量只显示成
`[10, 20, 30]` 这样的文本，看不到内存格子，也没有堆区和箭头。

## 目标布局
栈区：帧从上到下（depth 0 在最上）。每个变量仍占一行（行高 26 不变，帧高公式不变）：
  名字 x=24 / 类型 x=110 / 值位置 x=200 改成显示 `size 3 · cap 4`（seq）或原值（scalar）/ 地址右对齐。
栈区下方：「堆」区标题，再画出每个堆块。

## 第 1 步 · 追加 `renderCells(items, capacity, prevItems)`（约 35 行）
返回 SVG 片段字符串：
- 单格宽 40、高 24、间距 3；格子上方 10px 处写下标（11 号字，muted）
- 每格：`<rect rx=4>` + 居中 `<text>`（值超 6 字符截断）
- `capacity > size` 时补 `(capacity-size)` 个虚线空格（`stroke-dasharray`），最多补 24 个，超出写 `+N`
- 与 prevItems 不同的格子加 class `changed`
- 返回 `{ svg, width }`（width 供箭头定位）

## 第 2 步 · 堆区（约 35 行）
在渲染完所有栈帧后，若 `step.heap` 非空：
- 标题行写 `堆`，右端写最内层块的地址
- 每个块：`<g class="heap-block" data-addr="0x...">`
  - 头部一行：`<地址简写> <type>[<count>] cap <capacity>`
  - 头部下 4px 放 `renderCells(block.items, block.capacity, prevBlock.items)`
  - 块高 = 22 + 24 + 16；块间隔 10

## 第 3 步 · 栈上数组（约 15 行）
若某个 `seq` 变量的 `dataAddr` 未能匹配任何 heap 块（即栈上的原生数组），
就在该变量行下方紧接着画一行格子，并把该帧高度加 `24+8`（同步修改帧高计算）。
先记录每帧"额外行数"再算总高，不要边画边改高度。

## 第 4 步 · 箭头（约 30 行）
- 在 `<defs>` 里定义一个箭头 marker（`id="mem-arrow"`，深色底上用 `--accent` 颜色）
- 对每个带 `dataAddr` 且能匹配到 heap 块的 `seq` 变量，从该行右端
  `(frameX + frameW - 12, rowCenterY)` 画一条三次贝塞尔到堆块左边缘
  `(blockX, blockY + blockH/2)`，控制点取两者水平中点
- 路径加 class `mem-arrow`，并在线中点写简短地址标签（10 号字，muted）
- 匹配靠 `dataAddr === block.addr` 字符串相等

## 第 5 步 · app.js 修 B2（5 行）
程序输出改为只在最后一步显示：把 `result.programOutput` 存进 `state.programOutput`，
`goTo()` 里按 `idx === steps.length - 1` 决定 `el.programOutput.textContent` 显示真实输出还是
`（程序运行结束后显示）`。

## 第 6 步 · style.css 追加（约 30 行）
`.mem .heap-block rect`、`.mem .cell rect`、`.mem .cell.changed rect`（描边 `#f5b942`）、
`.mem .cell text`、`.mem .mem-arrow`（`fill:none; stroke: var(--accent); stroke-width:1.5`）、
`.mem .heap-title`。全部用现有 CSS 变量，不要内联 style。

## 验收（逐条自测）
1. `./build.sh` 通过；`./smoke.sh` PASS
2. vector 示例：栈区 `main` 帧里 `v` 显示 `size 3 · cap 4`；下方「堆」区有一块 3 格 `10 20 30` + 1 个虚线空格；
   栈到堆之间有一条带箭头的曲线
3. 递归示例仍正常（5 帧、地址递增）
4. 第 1 步时程序输出区显示占位文字，拖到最后一步才显示真实输出

## 收工
DEVLOG.md §7 顶部加 3 行日志；总结 3 行（写出卡在第几步，如果有）。
