【P1-A】tracer 识别 map / set / pair（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤35 行；总结 ≤3 行。

## 现状
`_node()` 的判断顺序是：array → vector/deque → string → record → ptr → scalar。
所以 `map`/`set`/`pair` 会掉进 `record`，被展开成红黑树内部字段（`_M_t` 之类），界面上是噪音。

## 要做的事：在 record 分支**之前**插入三个分支

### 1) map / unordered_map（约 15 行）
判断：`"map<" in type_name or "unordered_map<" in type_name`
生成：
```
{"name":..., "kind":"map", "type":..., "addr":..., "size": N,
 "items":[{"k":"apple","v":"3"}, ...]}
```
- `N = value.GetNumChildren()`
- 每个元素 `item = value.GetChildAtIndex(i)`，它通常是 `std::pair<const K, V>`
- 键取值：先试 `item.GetChildMemberWithName("first")`，取不到就用 `item.GetChildAtIndex(0)`
- 值取值：`GetChildMemberWithName("second")`，取不到用 `GetChildAtIndex(1)`
- 文本用现成的 `_text()`

### 2) set / unordered_set（约 8 行）
判断：`"set<" in type_name or "unordered_set<" in type_name`
生成 `{"kind":"set","items":[文本...], "size": N}`，元素用 `value.GetChildAtIndex(i)`。

### 3) pair（约 6 行）
判断：`"pair<" in type_name`
生成 `{"kind":"pair","first":"...","second":"...","size":2}`。

## 顺序要求（重要）
这三个分支必须插在 `IsPointerType()` 和 record 判断**之前**，
并且要在 vector/deque/string 之后（避免 `vector<pair<int,int>>` 被误判）。

## 自测（必须跑，把输出贴进总结）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
cat > /tmp/stl.cpp <<'EOF'
#include <cstdio>
#include <map>
#include <set>
#include <string>
using namespace std;
int main() {
    map<string,int> m;
    m["apple"] = 3;
    m["banana"] = 5;
    set<int> s;
    s.insert(3); s.insert(1); s.insert(2);
    pair<int,int> p = {7, 8};
    printf("%d %zu\n", m["apple"], s.size());
    return 0;
}
EOF
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer /tmp/stl.cpp -o out/stl.out
VIZ_SRC=/tmp/stl.cpp VIZ_MAX_STEPS=300 lldb -b \
  -o "settings set target.output-path out/stl.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/stl.out > out/stl.log 2>&1
grep '^VIZ' out/stl.log | tail -2
```
验收：输出里能看到 `"kind": "map"` 且 items 里有 apple/banana；`"kind": "set"` 有 3 个元素；
`"kind": "pair"` 的 first=7 second=8。若取不到，把 `item.GetNumChildren()` 与实际成员名写进总结。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行。
