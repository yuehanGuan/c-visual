【P1-C】把 map/set/pair 分支降级为安全版（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 不要运行 maponly 相关测试（它会卡死，我自己验）。只跑 vector + recursion。
总结 ≤3 行。

## 必须做的四件事

1. 删掉调试输出：把 `sys.stderr.write("DBG ...")` 这类行全部删除。

2. 把 map / unordered_map 分支**整段替换**为：
   - 只做 `node.update(kind="opaque", value="容器展开暂不可用")` 然后 `return node`
   - **绝对不要再调用** `GetNumChildren()`、`GetChildAtIndex()`、`GetSyntheticChildren()`、`GetSummary()`
   - 原因：未构造的 std::map 会让 libc++ formatter 在 C++ 层死循环

3. 把 set / unordered_set 分支做同样处理（整段替换成 opaque 那两行）。

4. `pair` 分支：如果你不确定它是否安全，也一并替换成 opaque 两行。

5. `bootstrap()` 里把 `os.path.abspath(os.environ.get("VIZ_SRC", ""))` 改成 `os.path.realpath(...)`。

## 自测（只跑这两个，不要跑 map 相关）
```
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/vector.cpp -o out/v.out
VIZ_SRC=samples/vector.cpp VIZ_MAX_STEPS=200 lldb -b \
  -o "settings set target.output-path out/v.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/v.out > out/v.log 2>&1
grep -c '^VIZ' out/v.log
```
验收：vector 仍有 `"kind": "seq"` 且带 `capacity`，VIZ 条数 ≥ 3。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行。
