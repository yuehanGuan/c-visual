【M2-A1】给 tracer 补地址信息 —— 只改 1 个文件

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只允许改：tracer/tracer.py（外加 DEVLOG.md 加 3 行日志）
禁止：改 Java、改前端、改样例、重构现有函数

⚠️ 单轮输出有长度上限（约 8192 token），**只做这一件事就停**。
不要顺手改别的文件，不要写长解释，最后总结 ≤4 行。

## 要做的事（沿用现有 _node()，只新增字段，不改已有字段语义）

1. 每个变量节点新增 `addr`：变量自身在内存中的地址，十六进制字符串，例 `"0x16fdff2c8"`
   - 取 `value.GetLoadAddress()`，无效（等于 `lldb.LLDB_INVALID_ADDRESS` 或 0）则省略该字段
2. `seq` 节点新增 `dataAddr`：首个元素的地址
   - 原生数组：`value.GetLoadAddress()`
   - vector/deque：取 `GetNonSyntheticValue()` 的 `__begin_`（或 `_M_start`）指针值
3. 新增 `kind:"ptr"`（判定放在 array/vector/string 之后、scalar 之前）
   - 条件：`vtype.IsPointerType()`
   - 字段：`{"name","kind":"ptr","type","value","addr","target"}`
   - `target` = 指针值转十六进制，空指针写 `"0x0"`
4. 每条 `step` 记录新增 `heap` 数组（与 `frames` 同级）
   - **只收 vector/deque 的缓冲区**（栈上的数组不算堆，别放进来）
   - 元素：`{"addr":"0x602010","type":"int","count":3,"capacity":4,"items":["10","20","30"]}`
   - `type` 是元素类型名（过 `_short_type`）；`count` = size；`capacity` 取不到就省略
   - 没有堆块时给空数组 `[]`，不要省略字段

## 自测（必须跑，把这条的输出贴进总结）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/vector.cpp -o out/v.out
VIZ_SRC=samples/vector.cpp VIZ_MAX_STEPS=200 lldb -b \
  -o "settings set target.output-path out/v.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/v.out > out/v.log 2>&1
grep '^VIZ' out/v.log | sed -n '5p'
```
验收标准：这一行里 `v` 节点同时有 `addr`、`dataAddr`、`capacity`，且该记录的 `heap` 非空。

## 收工
在 DEVLOG.md §7 顶部加一条日志（≤3 行），然后总结 ≤4 行。
