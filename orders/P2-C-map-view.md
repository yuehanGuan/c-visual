【P2-C】前端渲染 map 两列表格 + 去掉 key 的引号（改 2 个文件）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；总结 ≤3 行。

## 现状
trace 已经能输出：`{"kind":"map","type":"map<string, int, less<string>>","size":2,
"items":[{"k":"\"apple\"","v":"3"},{"k":"\"banana\"","v":"5"}]}`
但前端没有 map 分支，画不出来。另外 key 带着转义引号（`\"apple\"`），显示难看。

## 1) tracer/tracer.py：去掉字符串的引号（约 4 行）
在生成 map 的 k / v 文本后加一个清理：若文本以 `"` 开头且以 `"` 结尾，就去掉首尾引号。
只处理 map 的 k/v，不要改其它字段。

## 2) memory.js：新增 map 渲染（约 25 行）
在 `textOf`（或等价取值函数）里加 `kind === "map"` 分支：
- 摘要文字：`{ apple: 3, banana: 5 }`，超过 3 对只显示前 3 对并加 `, …`
- 空 map 显示 `{ }`（注意 size=0 时）
另外在 `renderSlot` 里给该行加 class `map`，方便样式区分。

## 3) style.css 追加（约 3 行）
`.mem .slot.map text { fill: #82aaff; }`（与 scalar 的灰白区分）

## 自测
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
再用页面或 curl 跑 samples/stl.cpp，确认：
- trace 里 key 是 `apple` 而不是 `\"apple\"`
- 页面上 `m` 那行显示成 `{ apple: 3, banana: 5 }`

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行。
