【P0-C】前端渲染 record（struct）—— 只改 memory.js

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；只改 src/main/resources/web/memory.js；总结 ≤2 行。

## 现状
trace 里 `struct` 变量已经是：
```
{"name":"n","kind":"record","type":"Node","addr":"0x...",
 "fields":[{"name":"v","kind":"scalar","type":"int","value":"7"}]}
```
但前端没有 record 分支，`n` 显示不出内容。

## 要做的事
1. 找到当前把 kind 转成"显示文本"的函数（`textOf` 或类似），加 `record` 分支（约 12 行）：
   - 输出形如 `{ v = 7 }`，字段间用 `, ` 分隔
   - 每个字段：`字段名 = 字段值`（字段值用同一函数递归取；`ptr` 字段显示 `→ 0x...`）
   - 字段数超过 4 个时只显示前 4 个并加 `, …`
   - `truncated === true` 时末尾加 `…`
2. record 那一行的 class 加上 `record`，便于样式区分（约 2 行）。
3. style.css 追加一条（约 3 行）：`.mem .slot.record text { fill: #c3e88d; }` 之类，颜色自选但要和 scalar 区分得开。

## 自测
`./build.sh` 通过后，用 curl 跑这段代码，确认 trace 正常：
```
#include <cstdio>
struct Node { int v; };
int main() {
    Node n;
    n.v = 7;
    printf("%d\n", n.v);
    return 0;
}
```
然后用无头浏览器截图（或直接打开页面）确认 `n` 那一行显示成 `{ v = 7 }` 而不是空白。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（写出 `n` 实际显示了什么）。
