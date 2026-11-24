【P3-A】set / pair 展开（改 tracer/tracer.py + memory.js）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；总结 ≤3 行。

## 现状
map 已经能用"声明步不读守卫 + 展开"的方式安全工作了。
set / pair 现在还是 opaque 两行（`node.update(kind="opaque", value="容器展开暂不可用")`）。

## 第 1 次工具调用 · tracer/tracer.py：恢复 set 展开（约 10 行）
把 set/unordered_set 分支的 opaque 两行替换成：
- `count = value.GetNumChildren()`
- `for i in range(min(count, 200))`：`items.append(_text(value.GetChildAtIndex(i)))`
- `node.update(kind="set", size=count, items=items)`；`count > 200` 时加 `"truncated": True`

## 第 2 次工具调用 · tracer/tracer.py：恢复 pair 展开（约 8 行）
把 pair 分支的 opaque 两行替换成：
- `first = _member(value, "first")` 或 `value.GetChildAtIndex(0)`
- `second = _member(value, "second")` 或 `value.GetChildAtIndex(1)`
- `node.update(kind="pair", first=_text(first), second=_text(second), size=2)`

## 第 3 次工具调用 · memory.js：加两个显示分支（约 20 行）
在 `textOf`（或等价取值函数）里：
- `kind === "set"` → 显示 `{ 1, 2, 3 }`（元素用 `, ` 连接，超 6 个加 `, …`，空集显示 `{ }`）
- `kind === "pair"` → 显示 `( 7, 8 )`
并在 `renderSlot` 里给这两类行分别加 class `set` / `pair`。

## 第 4 次工具调用 · style.css（约 4 行）
```
.mem .slot.set text { fill: #f78c6c; }
.mem .slot.pair text { fill: #c3e88d; }
```

## 自测（必须跑）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
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
for f in last['frames']:
    for v in f['vars']:
        print(v['name'], v['kind'], json.dumps({k:v.get(k) for k in ('items','first','second')}, ensure_ascii=False)[:80])
PY
```
验收：`s` 是 `"kind":"set"` 且 items 为 `["1","2","3"]`（**有序**）；
`p` 是 `"kind":"pair"` 且 first=7 second=8；**必须 15 秒内跑完，不许卡**。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（贴出上面那个变量清单）。
