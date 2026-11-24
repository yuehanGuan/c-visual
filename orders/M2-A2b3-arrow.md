【M2-A2b3】只修箭头几何 —— 只改 memory.js 里的箭头路径

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改一个文件：src/main/resources/web/memory.js（只动生成 mem-arrow 那段 path 的代码）
⚠️ 每次工具调用 ≤30 行；不要改别的逻辑；总结 ≤3 行。

## 现在的毛病（我截图看到的）
从栈上 `v` 行右端到堆块的箭头：
1. 曲线向右冲出 SVG 边界（跑出面板外再绕回来）
2. 箭头端压在第一个格子 `10` 的文字上
3. 曲线穿过「堆」标题和地址文字

## 要求（硬约束）
1. 路径所有坐标必须在 `[0, W] × [0, H]` 内，**不允许任何一段超出**
2. 起点：该变量行的右端 `(frameX + frameW - 12, rowCenterY)`
3. 终点：对应堆块**右边缘中点** `(blockX + blockW - 2, blockY + blockH / 2)`
   —— 用右边缘而不是左边缘，避免压住格子文字
4. 控制点只能在起点与终点之间摆动，横向偏移量 `|dx| <= 16`：
   建议 `d = "M ax,ay C ax+16,ay  bx+16,by  bx,by"`
   （`ax` 是起点 x，`bx` 是终点 x；若 `bx < ax` 则用 `ax-16` / `bx-16` 保持同侧）
5. 地址标签放在路径中点再向上偏移 10px，且必须 clamp 在 `[0, W]` 内
6. 若终点 `by` 与起点 `ay` 几乎相等（同一水平线），改用直线 `L`

## 自测
`./build.sh` 通过；启动服务后打开 `#sample=vector&run=9`，
确认箭头完整落在面板内、不压任何文字、箭头尖在堆块右边缘。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行。
