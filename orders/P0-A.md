【P0-A】opaque 兜底 + 全局变量采集（改 2 个文件，各一处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤25 行；不要重写文件；不要解释；总结 ≤2 行。

## 1) memory.js：补 `opaque` 与 `ptr` 两个分支（约 20 行）
现在 `renderSlot`/`textOf` 只处理 scalar/seq/grid/text，遇到其它 kind 会显示成空白。
在取值文本的地方加：
- `kind === "opaque"` → 显示 `type` + `（不支持的类型）` 字样，颜色用 muted；
  若节点有 `value` 字段则一并显示
- `kind === "ptr"` → 显示 `→ ` + 节点的 `value`（例 `→ 0x16fdfeb9c`）；
  若 `target === "0x0"` 则显示 `→ null`

要求：**任何 kind 都必须渲染出至少一行可见文字，绝不能空白。**

## 2) tracer/tracer.py：采集全局/静态变量（约 3 行）
第 301 行附近：
`values = frame.GetVariables(True, True, False, True)` → 把第 3 个参数改成 True。

验证时注意：若渲染出来的全局变量数量爆炸（某个帧出现 > 20 个 `std::` 开头的变量），
停下来把这个现象写进总结，不要自行过滤。

## 自测
1. `./build.sh` 通过；`./smoke.sh` PASS
2. 写一段带全局变量的代码跑一次，确认全局变量出现在栈帧里：
```
#include <cstdio>
int g_count = 0;
struct Node { int v; };
int main() {
    g_count = 1;
    Node n;
    n.v = 7;
    printf("%d\n", g_count);
    return 0;
}
```
用 curl 调 `POST /api/run`，检查 trace.jsonl 里是否出现 `g_count`，以及 `n` 是否是 `opaque`。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（写出 g_count 是否出现、opaque 是否显示文字）。
