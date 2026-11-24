【P7-C】守卫只作用于局部变量，参数不守卫（只改 tracer/tracer.py 的 _frame_vars）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py 的 `_frame_vars`
⚠️ 每次工具调用 ≤30 行；不要探索，直接改；总结 ≤2 行。

## 问题（已定位）
"声明步守卫"对**函数参数**也生效了：函数刚被调用那一步，参数名在该栈深下第一次出现，
于是被标成 `kind:"opaque"`、value「（声明中，下一步展开）」。
后果：递归调用树拿不到参数值，标签只能显示 `fib(int)` 而不是 `fib(int) n=3`。

参数在函数入口**必然已初始化**，不需要守卫。

## 改法
现在的代码大概是：一次 `frame.GetVariables(True, True, True, True)` 拿到全部变量，再统一过守卫。

改成**分两次取**：
1. `args = frame.GetVariables(True, False, False, True)`   ← 只有参数
2. `rest = frame.GetVariables(False, True, True, True)`     ← 局部 + 静态/全局

然后：
- **对 args**：不走守卫，直接 `_node(value, heap)`（但名字过滤规则照旧要生效）
- **对 rest**：走原来的守卫逻辑（`_prev_vars` 判断 + 名字过滤）
- 更新 `_prev_vars` 时：**把 args 的名字也写进去**（否则下一步参数会被误判成"新出现"）

顺序：先输出 args，再输出 rest，保持变量顺序自然。

## 自测（两条）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/recursion.cpp -o out/r.out
VIZ_SRC=samples/recursion.cpp VIZ_MAX_STEPS=400 lldb -b \
  -o "settings set target.output-path out/r.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/r.out > out/r.log 2>&1
python3 - <<'PY'
import json
# 找 fib 第一次进入的那一步，检查参数 n 的 kind
for l in open('/Users/han./Documents/deepseek-harness/default-workspace/cppviz/out/r.log'):
    if not l.startswith('VIZ '): continue
    d=json.loads(l[4:])
    if d.get('t')!='step': continue
    if len(d['frames'])>=2 and d['frames'][0]['fn'].startswith('fib'):
        print(d['n'], [(v['name'], v['kind'], v.get('value')) for v in d['frames'][0]['vars']])
        break
PY
```
验收：fib 第一次进入那一步，参数 `n` 的 kind 必须是 `"scalar"` 且 value 是数字，**不能是 opaque**。
另外回归：`samples/stl.cpp` 里 map 仍能展开（守卫对局部变量仍然生效，不许卡死）。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（贴出上面那行输出）。
