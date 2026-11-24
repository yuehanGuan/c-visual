【P0-E】只修指针箭头几何 —— 只改 memory.js 里 ptr 箭头的锚点与 path

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：src/main/resources/web/memory.js（只动与 `addrPoints` / `ptr` 箭头有关的行）
⚠️ 每次工具调用 ≤20 行；总结 ≤2 行。

## 现在的毛病（我截图看到）
1. 目标锚点取在**行左边缘**（`x: 帧左边缘 + 6`），起点在**行右边缘**，
   于是曲线横穿整行、绕成圈，还和别的箭头打结。
2. 多个箭头在同一区域互相压住。

## 改法（只改坐标，不改逻辑）
1. `addrPoints[addr]` 的 x 改成**行右边缘再往右 6px**：
   `x: frameX + frameW + 6`，y 仍是该行中线。
2. 起点改为 `x: frameX + frameW - 4`（行右边缘内侧一点），y 为该行中线。
3. path 改成在同一侧鼓出的括号形：
   `M sx,sy C ${sx + 18},${sy} ${tx + 18},${ty} ${tx},${ty}`
4. 所有坐标 clamp 到 `[0, W]` 与 `[0, H]`。
5. 去重：同一个 `(fromY, target)` 组合只画一条。
6. 超过 4 条时不画新箭头，改为在第一个箭头旁写一个 `+N` 的小字（避免打结）。

## 自测
用这段代码跑，确认：
- `p` 的箭头在右侧留白内，是一条括号形曲线，箭头尖指向 `x` 那一行的右端
- 箭头之间不交叉、不穿文字
```
#include <cstdio>
struct Node { int v; Node *next; };
int main() {
    Node a, b;
    a.v = 1; b.v = 2;
    a.next = &b; b.next = nullptr;
    int x = 5;
    int *p = &x;
    printf("%d\n", *p);
    return 0;
}
```

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行。
