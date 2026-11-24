【只改 1 行】修箭头路径几何

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
文件：src/main/resources/web/memory.js
位置：第 195 行附近的
`parts.push(\`<path class="mem-arrow" marker-end="url(#mem-arrow)" d="M ${ax},${ay} C ${mx},${ay} ${mx},${by} ${bx},${by}"/>\`);`

## 要求
把这条 path 的 `d` 改成"控制点贴近起点/终点"的形式，使曲线不冲出面板：
- 控制点横向偏移固定 16px，方向与 (bx-ax) 一致：
  `cx1 = ax + Math.sign(bx - ax) * 16`，`cx2 = bx + Math.sign(bx - ax) * 16`
- 若 `ax === bx`（同一竖线），直接用 `L` 直线
- 终点 `(bx, by)` 改为取堆块**右边缘中点**（在调用处传 bx 时改成 block 右边，不是左边）
- 起点 `ax` 用帧右边缘 -12，保持不变

## 只做这一件事
改完跑 `./build.sh` 确认编译通过就停。不要改别的，不要写解释。
总结就一行：`A2b4 done` 或 `A2b4 failed: 原因`。
