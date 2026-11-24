【P2-A】修两个明确的 bug（改 2 个文件，各一处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤20 行；只改指定的两处；总结 ≤2 行。

## Bug 1：退出码非 0 被误判成崩溃
文件：src/main/java/dev/cppviz/RunService.java 第 87 行附近
现状：`} else if (traced.exitCode() != 0) {` → 程序 `return 1;` 会被报成 `"outcome":"crash"`。
这是错的：非 0 退出码是程序自己的 return 值，不是崩溃。真正的崩溃已经由
`reason == "crash"`（lldb 识别到 EXC_/SIG 标记）覆盖了。
改法：把条件改成 `traced.exitCode() < 0`（负值才视为异常终止），并加一行注释说明原因。

## Bug 2：trace 里残留调试字段 `_line`
文件：tracer/tracer.py
现状：节点里有 `"_line": 5` 这种调试字段（grep `"_line"` 能找到 2 处）。
改法：把写入 `_line` 的那行删除（不要动别的字段）。

## 自测（两条都要跑，把结果贴进总结）
1. 构建 + 回归：
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
2. 退出码回归：
```
./run.sh > out/app.log 2>&1 &
sleep 3; P=$(sed -n 's/^VIZ_PORT=//p' out/app.log | head -1)
curl -s -X POST "http://127.0.0.1:$P/api/run" --data-urlencode "code=int main(){ return 1; }"
pkill -f dev.cppviz.Main
```
验收：上面这条必须返回 `"outcome":"ok"`（允许带 exitCode:1），**不能是 crash**。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（写出 return 1 的实际 outcome、smoke 结果）。
