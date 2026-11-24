【P2-D】过滤掉非用户源文件里的变量（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤20 行；总结 ≤2 行。

## 问题（我实测到的）
为了采集全局变量，`GetVariables(True, True, True, True)` 把 libc++ 头文件里的静态变量也捞进来了。
跑一个 map 程序，栈帧里会多出这些噪音：
`std::__1::… const bool`、`std::__1::…piecewise_c…`、`std::__1::…basic_strin…`
必须只保留**声明在用户自己源文件里**的变量。

## 改法（在 `_frame_vars` 里加过滤，约 10 行）
对每个 `value`，取它的声明位置：
`decl = value.GetDeclaration()`；`decl_file = decl.GetFile()`（可能为 None 或空串）
- 若 `decl_file` 非空，且 `os.path.basename(decl_file) != os.path.basename(_src)` → **跳过这个 value**（continue）
- 若 `decl_file` 为空 → 保留（局部变量有时没有声明信息）

注意：`_src` 已经是 realpath，比较用 basename 即可。
不要影响现有的"声明步守卫"逻辑（`_prev_vars` 那段）：被过滤掉的变量不要写进 `_prev_vars`。

## 自测（两条）
1. map 程序（噪音必须消失）：
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/stl.cpp -o out/stl.out
VIZ_SRC=samples/stl.cpp VIZ_MAX_STEPS=300 lldb -b \
  -o "settings set target.output-path out/stl.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/stl.out > out/stl.log 2>&1
grep '^VIZ' out/stl.log | tail -1 | grep -o '"name": "[^"]*"' | sort -u
```
验收：输出里**只有** `m`（可能还有 s / p），不能出现 `std::__1::` 开头的名字。

2. 全局变量不能丢（回归）：
```
cat > samples/glob.cpp <<'EOF'
#include <cstdio>
int g_count = 0;
int main() {
    g_count = 7;
    printf("%d\n", g_count);
    return 0;
}
EOF
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/glob.cpp -o out/glob.out
VIZ_SRC=samples/glob.cpp VIZ_MAX_STEPS=100 lldb -b \
  -o "settings set target.output-path out/glob.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/glob.out > out/glob.log 2>&1
grep -c 'g_count' out/glob.log
```
验收：`g_count` 必须仍出现（>0），否则说明过滤太狠。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（写出 map 场景残留的变量名、g_count 是否还在）。
