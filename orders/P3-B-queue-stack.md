【P3-B】queue / stack 展开（改 tracer/tracer.py + memory.js）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；总结 ≤3 行。

## 背景
map/set/pair 已通过"声明步不读守卫 + 展开"安全可用。queue/stack 用同一套路。
注意：`std::queue` / `std::stack` 是**适配器**，libc++ 的 formatter 可能不直接给元素，
它们的底层容器是成员 `c`（deque 或 vector）。两条路都要试。

## 第 1 次工具调用 · tracer：queue（约 15 行）
新增分支（放在 vector/deque 之后、record 之前），条件 `"queue<" in type_name`：
- 先 `n = value.GetNumChildren()`；若 `n > 0` 直接从子元素取
- 若 `n == 0`，试 `inner = _member(value, "c")`，再 `n = inner.GetNumChildren()`，从 inner 取元素
- 输出 `{"kind":"queue","size":n,"items":[...],"front":0,"back":max(0,n-1)}`
- 元素文本用 `_text`；`n > 200` 时只取前 200 并加 `"truncated": True`

## 第 2 次工具调用 · tracer：stack（约 12 行）
条件 `"stack<" in type_name`，取元素方式同上；
输出 `{"kind":"stack","size":n,"items":[...],"top":max(0,n-1)}`

## 第 3 次工具调用 · memory.js：显示（约 18 行）
- `kind === "queue"` → 显示 `[ 1 | 2 | 3 ]`，若 size>0 在末尾加 `← back`、开头加 `front →`
  （空间紧张就只显示 `[ 1 | 2 | 3 ]`，并把 front/back 放进 title 属性）
- `kind === "stack"` → 显示 `[ 1 | 2 | 3 ] ← top`
- 给两类行分别加 class `queue` / `stack`

## 第 4 次工具调用 · style.css（约 4 行）
`.mem .slot.queue text { fill: #5ac8fa; }`、`.mem .slot.stack text { fill: #c792ea; }`

## 自测（必须跑，卡住就停）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
cat > samples/qs.cpp <<'EOF'
#include <cstdio>
#include <queue>
#include <stack>
using namespace std;
int main() {
    queue<int> q;
    q.push(1); q.push(2); q.push(3);
    stack<int> st;
    st.push(10); st.push(20);
    printf("%d %d\n", q.front(), st.top());
    return 0;
}
EOF
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
验收：`q` 是 `"kind":"queue"` items `["1","2","3"]`；`st` 是 `"kind":"stack"` items `["10","20"]`；不许 HANG。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（写出 HANG/OK 与两个 items）。
