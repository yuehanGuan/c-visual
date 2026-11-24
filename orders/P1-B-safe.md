【P1-B】止血：map/set 禁止触碰 formatter + 修 realpath（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤25 行；总结 ≤3 行。

## 已实测确认的严重 bug
`map<string,int> m;` 这一行（对象还没构造完）会让 tracer **永久卡死**：
libc++ 的 map formatter 走进未初始化的红黑树，在 C++ 层死循环，Python 层无法中断。
同样问题适用于 `set`。这会让任何含 map/set 的用户代码都拿不到 trace。

## 改法 1：map / set / pair 只输出摘要，**绝不调用** GetNumChildren / GetChildAtIndex
把刚才加的 map/set/pair 三个分支改成：
```
node.update(kind="opaque", value="（容器展开暂不可用：%s）" % type_name)
return node
```
即：保留类型名，明确告诉用户"暂不可展开"，但**一个 formatter 子元素都不要读**。
（`pair` 可以保留读取 first/second，因为 pair 没有树结构、不会死循环；如果你不确定，pair 也一并降级。）

## 改法 2：修符号链接路径
`bootstrap()` 里 `_src = os.path.abspath(...)` 改成 `os.path.realpath(...)`
（macOS 上 /tmp 是 /private/tmp 的符号链接，abspath 不解析链接会导致断点全部建不上、steps=0）

## 自测（必须三条都跑，把结果贴进总结）
1. `samples/maponly.cpp`（只有 `map<string,int> m;`）→ **必须正常结束**，不能卡死：
```
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/maponly.cpp -o out/mo.out
VIZ_SRC=samples/maponly.cpp VIZ_MAX_STEPS=100 lldb -b \
  -o "settings set target.output-path out/mo.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/mo.out | grep -c '^VIZ'
```
期望：1 秒内结束，输出 ≥ 3 条 VIZ（meta + step + end），且 step 里 `m` 是 `"kind":"opaque"`。

2. `samples/vector.cpp` → 仍要有 `"kind":"seq"` 和 capacity（别把好的改坏）

3. `samples/recursion.cpp` → 仍正常

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（写出 maponly 是否还卡、VIZ 条数）。
