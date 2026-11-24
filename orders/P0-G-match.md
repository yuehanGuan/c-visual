【P0-G】指针地址改成数值匹配 + 加调试属性（只改 memory.js）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：src/main/resources/web/memory.js
⚠️ 每次工具调用 ≤20 行；总结 2 行。

## 已确认的事实
trace 数据正确：`p.target = "0x16fdfecc4"`，`x.addr = "0x16fdfecc4"`，字符串严格相等。
但 `renderPtrArrows` 里 `addrPoints[link.target]` 始终找不到 → 走了兜底短线。
说明字符串比对在某些情况下不可靠（大小写、前导零、或键被覆盖）。

## 改法 1：数值匹配（约 8 行）
在 `renderPtrArrows` 开头，用 `addrPoints` 建一张数值键的索引：
`const byNum = {}; Object.keys(addrPoints).forEach(k => { const n = Number(k); if (!isNaN(n)) byNum[n] = addrPoints[k]; });`
查表时：
`const target = (addrPoints && addrPoints[link.target]) || byNum[Number(link.target)];`

## 改法 2：加调试属性（约 4 行）
`renderPtrArrows` 目前只返回字符串。改成返回 `{ svg, drawn, miss }`，
调用处把 `<svg>` 上加上 `data-ptr-drawn="${drawn}"` 和 `data-ptr-miss="${miss}"`。
（`miss` 是走了兜底分支的条数）

## 自测
跑这段代码，然后在浏览器控制台或 CDP 里读 `document.querySelector('.mem').dataset`，
确认 `ptrDrawn >= 1`（即至少有一条指针成功连到目标）：
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
若 `ptrDrawn` 仍为 0，把 `Object.keys(addrPoints)` 和所有 `link.target` 的值打到
`data-ptr-debug` 属性里（一行 JSON），不要自己猜。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（写出 ptrDrawn 的实际值）。
