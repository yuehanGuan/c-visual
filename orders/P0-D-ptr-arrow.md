【P0-D】指针箭头 —— 改 memory.js（主）+ style.css（3 行）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；不要重写文件；不要解释；总结 ≤3 行。

## 现状
`ptr` 变量只显示文字 `→ 0x16fdfecc8`，没有连线。实测数据：
`a` 的 `addr` 是 `"0x16fdfecc8"`，`p` 的 `target` 也是 `"0x16fdfecc8"`，字符串可以直接相等匹配。
（`p` 形如 `{"name":"p","kind":"ptr","type":"int *","value":"0x16fdfecc8","addr":"0x...","target":"0x16fdfecc8"}`）

## 第 1 步 · 收集地址锚点（约 15 行）
在渲染每个变量行的地方（`renderSlot` 或调用处），若节点有 `addr` 字段，记录：
`addrPoints[addr] = { x: 帧左边缘 + 6, y: 该行中线 }`
同时把 `kind === "ptr"` 且 `target !== "0x0"` 的变量记进数组：
`{ target, from: { x: 帧右边缘 - 12, y: 该行中线 }, value }`

把这两个集合作为参数传给后续渲染（或挂在返回对象上），不要用全局变量。

## 第 2 步 · 画箭头（约 25 行）
在所有栈帧与堆块都画完之后（最后一步），遍历 ptr 列表：
- 若 `addrPoints[target]` 存在：画
  `<path class="mem-arrow ptr-arrow" marker-end="url(#mem-arrow)" d="..."/>`
  起点 `from`，终点 `addrPoints[target]`。
  控制点横向偏移 ≤16px，**所有坐标必须 clamp 在 [0, W] × [0, H] 内**（防止冲出面板）。
- 若不存在：从 `from` 向右画 18px 的短线，末端加 `<text class="ptr-miss">?</text>`。
- 线条颜色用 `#c792ea`（和 seq 箭头 #5ac8fa 区分）。

## 第 3 步 · style.css 追加（约 5 行）
```
.mem .ptr-arrow { stroke: #c792ea; }
.mem .ptr-miss { font: 11px var(--mono); fill: #c792ea; }
```

## 自测（必须跑）
```
#include <cstdio>
struct Node { int v; Node *next; };
int main() {
    Node a, b;
    a.v = 1;
    b.v = 2;
    a.next = &b;
    b.next = nullptr;
    int x = 5;
    int *p = &x;
    printf("%d\n", *p);
    return 0;
}
```
用 curl 调 `POST /api/run`，或直接用页面跑；确认 `p` 有一条紫色箭头连到 `x` 那一行。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（写出箭头是否画出来）。
