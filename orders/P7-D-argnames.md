【P7-D】两处小编辑（只改 tracer/tracer.py 的 _frame_vars）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ **不要读整个文件**，用 edit 带下面给的锚点直接改；每次调用 ≤20 行；总结 1 行。

## 编辑 1：在 `prev = _prev_vars.get(_cur_depth, set())` 之后插入
```python
    # Arguments are always initialised at function entry, so the
    # declaration-step guard must not apply to them (a recursive call would
    # otherwise report its own parameter as "being declared").
    arg_names = set()
    try:
        for arg in frame.GetVariables(True, False, False, True):
            arg_name = arg.GetName() or ""
            if arg_name.startswith("::"):
                arg_name = arg_name[2:]
            if arg_name:
                arg_names.add(arg_name)
    except Exception:
        pass
```

## 编辑 2：把这一行
```python
        if name not in prev:
```
改成
```python
        if name not in prev and name not in arg_names:
```

## 自测
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
for l in open('/Users/han./Documents/deepseek-harness/default-workspace/cppviz/out/r.log'):
    if not l.startswith('VIZ '): continue
    d=json.loads(l[4:])
    if d.get('t')!='step': continue
    if len(d['frames'])>=2 and d['frames'][0]['fn'].startswith('fib'):
        print(d['n'], [(v['name'], v['kind'], v.get('value')) for v in d['frames'][0]['vars']])
        break
PY
```
验收：fib 首次进入那步，参数 n 的 kind 必须是 `"scalar"`、value 是数字。
再跑 `samples/stl.cpp` 确认 map 仍能展开且不卡（守卫对局部变量仍生效）。

## 收工
总结 1 行，贴出上面那行输出。
