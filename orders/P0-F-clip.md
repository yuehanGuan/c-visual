【只改 3 个数值】指针箭头被画布裁掉

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
文件：src/main/resources/web/memory.js
只改 ptr 箭头 path 那几行，**别的不许动**。总结 1 行。

## 现象
箭头在右边距里只剩一小截弧，箭头尖被 SVG 右边界裁掉。原因是控制点 x 超出了画布宽度。

## 改法（把这三个位置改成固定算式）
设 `W` 为该步的 svg 宽度，`R = frameRight`（帧右边缘）。
1. 起点 x 与终点 x 都用 `R - 4`（改成一样，落在帧内右边缘）
2. 两个控制点 x 都用 `Math.min(W - 4, R + 14)`
3. y 保持不变（起点用指针行中线，终点用目标行中线）

即 path 形如：
`M ${R-4},${sy} C ${Math.min(W-4,R+14)},${sy} ${Math.min(W-4,R+14)},${ty} ${R-4},${ty}`

## 自测
`./build.sh` 通过；用页面跑下面的代码，确认箭头是完整的括号形、箭头尖在帧内可见、不被裁切：
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
总结 1 行：`P0-F done` 或说明卡点。
