【P1-D】安全地恢复 map 展开 —— 用"声明步不读"的守卫（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤30 行；不要跑 maponly（我自己验，它会卡）；总结 ≤3 行。

## 背景（已实测）
未构造完的 `std::map` 会让 libc++ formatter 在 C++ 层死循环，Python 无法中断。
所以我们之前把 map/set/pair 降级成了 opaque。现在要安全地恢复。

**关键洞察：卡死只发生在"变量刚声明、还没构造完"的那一步。**
如果我们在变量首次出现的那一步不读它，之后每步都读，就永远不会碰到未构造对象。

## 要做的事

### 1) 加守卫状态（约 5 行）
模块级维护 `_seen_vars = {}`（key = 帧 depth，value = 该帧上一步出现过的变量名 set）。
在 `_frame_vars(frame)` 里，对每个 value：
- 若 `name` 不在 `_seen_vars.get(depth, set())` 里 → 这个变量是"本步新出现"，
  直接生成 `{"name": name, "kind": "opaque", "type": _short_type(...), "value": "（声明中，下一步展开）"}`，
  **不要碰它的任何子元素**
- 否则按原有逻辑生成节点
每步结束（`_dump_frames` 返回前）用本步实际变量名更新 `_seen_vars`。

### 2) 恢复 map / unordered_map 分支
把现在的 opaque 两行换回真正的展开（约 15 行）：
`count = value.GetNumChildren()`；循环取 `GetChildAtIndex(i)`；
键用 `GetChildMemberWithName("first")`（取不到用 `GetChildAtIndex(0)`），
值用 `GetChildMemberWithName("second")`（取不到用 `GetChildAtIndex(1)`）；
输出 `{"kind":"map","size":count,"items":[{"k":...,"v":...}]}`。
再加保护：`count > 200` 时只取前 200 并加 `"truncated": true`。

### 3) set 仍然保持 opaque（这单不做）
pair 保持 opaque（这单不做）。

## 自测（只跑这两个，不要跑 maponly）
```
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/stl.cpp -o out/stl.out
VIZ_SRC=samples/stl.cpp VIZ_MAX_STEPS=300 lldb -b \
  -o "settings set target.output-path out/stl.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/stl.out > out/stl.log 2>&1
grep -c '^VIZ' out/stl.log
grep '^VIZ' out/stl.log | tail -1
```
验收：stl.cpp **必须在 15 秒内跑完**（不许卡），且某一步里 `m` 是 `"kind":"map"` 带 apple/banana。
若卡住，说明守卫没生效——立刻停下写进总结，我会介入。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行。
