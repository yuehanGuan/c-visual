【P0-B】tracer 增加 record 类型 + 清理全局变量名（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤25 行；只改这一个文件；总结 ≤2 行。

## 问题
实测 `struct Node { int v; }; Node n; n.v = 7;` 时，`n` 被归类成 `kind:"scalar"`，
因为 `_node()` 在 array/vector/string/ptr 之后一律 fallback 成 scalar。
`struct` 必须走新的 `record` 类型。

## 1) `_node()` 新增 record 分支（放在 string 分支之后、`IsPointerType()` 之前，约 18 行）
条件：`vtype.IsRecordType()`（且不是指针、不是数组 —— 前面已排除）
生成：
```
{"name": ..., "kind": "record", "type": <_short_type 名字>, "addr": ..., 
 "fields": [ {子节点}, ... ]}
```
- 用 `value.GetNumChildren()` 取字段数；**超过 50 个就只取前 50**，并加 `"truncated": true`
- 每个字段用 `_node(value.GetChildAtIndex(i))` 递归生成（字段名来自 `GetChildAtIndex(i).GetName()`）
- 字段的 `_node` 调用**不要传 heap**（避免 struct 里的 vector 污染堆列表），
  如果函数签名不方便，就先按 `_node(child, None)` 调用

## 2) 清理全局变量名（约 3 行）
在 `_node()` 生成 name 的地方：若名字以 `::` 开头，去掉开头的所有 `:`。
（lldb 会把全局变量命名成 `::g_count`，界面上应显示成 `g_count`）

## 自测（必须跑，把结果贴进总结）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
cat > /tmp/g.cpp <<'EOF'
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
EOF
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer /tmp/g.cpp -o out/g.out
VIZ_SRC=/tmp/g.cpp VIZ_MAX_STEPS=200 lldb -b \
  -o "settings set target.output-path out/g.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/g.out > out/g.log 2>&1
grep '^VIZ' out/g.log | sed -n '3p'
```
验收：输出里 `n` 的 `kind` 是 `record`，`fields` 里有 `v` 且值为 7；`g_count` 名字不带 `::`。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行。
