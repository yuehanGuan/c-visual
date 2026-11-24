【P2-B】加"声明步不读"守卫 + 恢复 map 展开（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 严格分两次工具调用做完，每次 ≤30 行；总结 ≤3 行。

## 背景
未构造完的 `std::map` 会让 libc++ formatter 在 C++ 层死循环（已实测）。
现在 map/set/pair 全是 opaque。要安全恢复 map。

## 第 1 次工具调用：加守卫（约 20 行）
模块级新增：`_prev_vars = {}`   # key: 帧 depth, value: 上一步该帧出现过的变量名 set

在 `_frame_vars(frame, heap)` 里，拿到 `values` 之后、遍历之前：
- 取 `depth = frame.GetFrameID()` 不要用；改成传入 depth（`_frame_vars` 现在没有 depth 参数的话，
  用一个模块级变量 `_cur_depth`，由 `_dump_frames` 在调用前设置）
- 对每个 value：
  - `name = value.GetName()`
  - 若 `name` 不在 `_prev_vars.get(_cur_depth, set())` 里 → 生成
    `{"name": name, "kind": "opaque", "type": _short_type(value.GetType().GetName()),
      "value": "（声明中，下一步展开）"}`
    然后 **continue**，绝不触碰该 value 的任何子元素
  - 否则走原有 `_node(value, heap)` 逻辑

在 `_dump_frames` 返回前，用本步实际出现过的变量名更新 `_prev_vars[_cur_depth]`
（每帧各自更新，用 `set()`）。

## 第 2 次工具调用：恢复 map 展开（约 15 行）
把现在 map 分支里的 opaque 两行，换成真正的展开：
`count = value.GetNumChildren()`；`for i in range(min(count, 200))` 里取 `GetChildAtIndex(i)`；
键 `GetChildMemberWithName("first")`（取不到用 `GetChildAtIndex(0)`），
值 `GetChildMemberWithName("second")`（取不到用 `GetChildAtIndex(1)`）；
输出 `{"kind":"map","size":count,"items":[{"k":..,"v":..}]}`；`count>200` 加 `"truncated": true`。
set / pair 保持 opaque，不要动。

## 自测（关键，卡住就立刻停）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/stl.cpp -o out/stl.out
( VIZ_SRC=samples/stl.cpp VIZ_MAX_STEPS=300 lldb -b \
  -o "settings set target.output-path out/stl.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/stl.out > out/stl.log 2>&1 ) &
sleep 15; if pgrep -f "stl.out" >/dev/null; then echo "HANG"; pkill -9 -f stl.out; else echo "OK"; fi
grep -c '^VIZ' out/stl.log
```
再跑一次 vector 确认没坏：
```
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/vector.cpp -o out/v.out
VIZ_SRC=samples/vector.cpp VIZ_MAX_STEPS=200 lldb -b -o "settings set target.output-path out/v.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/v.out > out/v.log 2>&1
grep -c capacity out/v.log
```
验收：stl 不 HANG，且 `out/stl.log` 里出现 `"kind": "map"` 带 apple/banana；vector 的 capacity 仍 >0。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（写出 HANG/OK、map 是否展开、vector capacity 数）。
