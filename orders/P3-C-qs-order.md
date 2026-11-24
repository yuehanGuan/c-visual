【P3-C】修 queue/stack 的判断顺序与下钻（只改 tracer/tracer.py）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
只改：tracer/tracer.py
⚠️ 每次工具调用 ≤25 行；总结 ≤2 行。

## 实测到的两个错误（请按证据改）
跑 `queue<int> q; stack<int> st;` 后：
- `q` 输出成了 `"kind":"seq"`（不是 queue），items 恰好是 ["1","2","3"]
  → 原因：`queue<int>` 的类型名是 `std::__1::queue<int, std::__1::deque<int,...>>`，
     **含 "deque<"**，于是先被前面的 vector/deque 分支截走了
- `st` 输出成了 `"kind":"seq"`，items 是 `["size=2"]`
  → 原因：`stack` 的 formatter 只给了一个子元素（底层容器），被当成了元素

## 改法 1：顺序（关键）
把 `queue<` / `stack<` 两个判断**移到 vector/deque 分支之前**。
（即：queue/stack 的检查必须先于 `"vector<" in type_name or "deque<" in type_name`）

## 改法 2：下钻底层容器（约 12 行）
在 queue/stack 分支里取元素的统一逻辑：
```
inner = _member(value, "c")
if inner is None and value.GetNumChildren() == 1:
    inner = value.GetChildAtIndex(0)
src = inner if (inner is not None and inner.GetNumChildren() > 0) else value
n = src.GetNumChildren()
items = [_text(src.GetChildAtIndex(i)) for i in range(min(n, 200))]
```
- queue 输出 `{"kind":"queue","size":n,"items":items,"front":0,"back":max(0,n-1)}`
- stack 输出 `{"kind":"stack","size":n,"items":items,"top":max(0,n-1)}`
- `n > 200` 加 `"truncated": True`

## 自测（必须跑，卡住就停）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
clang++ -std=c++17 -g -O0 -fno-omit-frame-pointer samples/qs.cpp -o out/qs.out
( VIZ_SRC=samples/qs.cpp VIZ_MAX_STEPS=200 lldb -b \
  -o "settings set target.output-path out/qs.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run -o "script import tracer; tracer.finish()" -- out/qs.out > out/qs.log 2>&1 ) &
sleep 15; if pgrep -f "qs.out" >/dev/null; then echo HANG; pkill -9 -f qs.out; else echo OK; fi
python3 - <<'PY'
import json
last=None
for l in open('/Users/han./Documents/deepseek-harness/default-workspace/cppviz/out/qs.log'):
    if l.startswith('VIZ '):
        d=json.loads(l[4:])
        if d.get('t')=='step': last=d
for f in last['frames']:
    for v in f['vars']:
        print(v['name'], v['kind'], json.dumps(v.get('items'), ensure_ascii=False))
PY
```
验收：`q` 必须是 `"kind":"queue"` items `["1","2","3"]`；
`st` 必须是 `"kind":"stack"` items `["10","20"]`；不许 HANG。
另外回归：`samples/vector.cpp` 仍必须是 `"kind":"seq"`（别把 queue 的判断弄得太宽）。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 2 行（贴出 q 与 st 的实际 kind/items）。
