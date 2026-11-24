【P2-E】用名字过滤库内部静态变量（只改 tracer/tracer.py 一处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤15 行；总结 ≤2 行。

## 实测现状
`GetDeclaration()` 过滤无效：libc++ 的静态变量声明文件为空，被"空则保留"规则放过了。
跑 map 程序时栈帧里仍有多余变量：
`std::__1::piecewise_construct`、`std::__1::integral_constant<bool, true>::value`、
`std::__1::basic_string<...>::npos` 等 7 个。

## 改法（在 `_frame_vars` 遍历 values 的最前面加，约 6 行）
对每个 value 取 `name = value.GetName() or ""`，满足任一条件就 `continue`（跳过）：
1. `"std::" in name`
2. `"::" in name`
3. `name.startswith("_")` 且 `not name.startswith("__")` —— 其实统一跳过以 `_` 开头的名字即可（用户变量很少以下划线开头，且这类多是库内部）

注意：
- 这一步必须在"声明步守卫"逻辑**之前**，被跳过的变量不要写进 `_prev_vars`
- 不要删掉已有的 `GetDeclaration` 代码也可以，但名字过滤必须先生效
- 用户自己的全局变量 `g_count`（剥掉 `::` 后）不含 `::`，不会被误杀

## 自测（两条都要跑）
1. map 场景：栈帧里应只剩 `m`/`s`/`p`，不能有任何 `std::__1::` 名字：
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/stl.cpp -o out/stl.out
VIZ_SRC=samples/stl.cpp VIZ_MAX_STEPS=300 lldb -b \
  -o "settings set target.output-path out/stl.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/stl.out > out/stl.log 2>&1
python3 - <<'PY'
import json
last=None
for l in open('/Users/han./Documents/deepseek-harness/default-workspace/cppviz/out/stl.log'):
    if l.startswith('VIZ '):
        d=json.loads(l[4:])
        if d.get('t')=='step': last=d
print([v['name'] for f in last['frames'] for v in f['vars']])
PY
```
2. 全局回归：`samples/glob.cpp`（已存在）跑一遍，确认 `g_count` 仍在，且无 `std::` 噪音。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（贴出上面那个变量名列表）。
