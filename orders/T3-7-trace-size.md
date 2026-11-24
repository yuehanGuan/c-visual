【T-3.7】trace 体积：容器逐节点上限 + 画布单元格上限（改 2 个文件，共 6 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py`、`memory.js` 的指定片段；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile tracer/tracer.py`、`node --check memory.js`、`./build.sh`。

## 背景（实测）
`int a[2000]` + 300 步的 trace 有 **5.0 MB**，每个节点塞 2000 个元素；
画布还会把 2000 个格子一格格画出来（约 8.6 万像素宽）。
目标：语义尺寸（`size`）不变，**载荷**每节点最多 200 个元素并标 `truncated`；
画布最多画 24 个格子。

## 第 1 次调用：read 四段
- `tracer/tracer.py` 第 38–45 行；第 303–320 行（数组分支）；第 352–355 行（vector 分支）；字符串分支（搜 `if "string" in type_name`）
- `memory.js` 的 `function renderCells(items, capacity, prevItems) {` 前三行

## 第 2 次调用：edit #1 —— tracer 常量
原文：
```
_max_frames = 64
```
改为：
```
_max_frames = 64
# Per-node payload cap: a 2000-element array over 300 steps made a 5 MB trace.
# `size` still reports the true count; only the items list is cut.
_MAX_ITEMS = 200
```

## 第 3 次调用：edit #2 —— 一维数组
原文：
```
            else:
                node.update(
                    kind="seq",
                    size=count,
                    items=[_text(value.GetChildAtIndex(i)) for i in range(count)],
                )
                if load_addr is not None:
```
改为：
```
            else:
                limit = count if count <= _MAX_ITEMS else _MAX_ITEMS
                node.update(
                    kind="seq",
                    size=count,
                    items=[_text(value.GetChildAtIndex(i)) for i in range(limit)],
                )
                if count > _MAX_ITEMS:
                    node["truncated"] = True
                if load_addr is not None:
```

## 第 4 次调用：edit #3 —— 二维数组
原文：
```
                cols = elem.size()
                rows = []
                for i in range(count):
                    row = value.GetChildAtIndex(i)
                    rows.append([_text(row.GetChildAtIndex(j)) for j in range(cols)])
                node.update(kind="grid", rows=rows, rowsCount=count, cols=cols)
```
改为：
```
                cols = elem.size()
                row_limit = count if count <= _MAX_ITEMS else _MAX_ITEMS
                col_limit = cols if cols <= 50 else 50
                rows = []
                for i in range(row_limit):
                    row = value.GetChildAtIndex(i)
                    rows.append([_text(row.GetChildAtIndex(j)) for j in range(col_limit)])
                node.update(kind="grid", rows=rows, rowsCount=count, cols=cols)
                if count > _MAX_ITEMS or cols > 50:
                    node["truncated"] = True
```

## 第 5 次调用：edit #4 —— vector / deque
原文：
```
        if "vector<" in type_name or "deque<" in type_name:
            size = value.GetNumChildren()
            items = [_text(value.GetChildAtIndex(i)) for i in range(size)]
            node.update(kind="seq", size=size, items=items)
```
改为：
```
        if "vector<" in type_name or "deque<" in type_name:
            size = value.GetNumChildren()
            limit = size if size <= _MAX_ITEMS else _MAX_ITEMS
            items = [_text(value.GetChildAtIndex(i)) for i in range(limit)]
            node.update(kind="seq", size=size, items=items)
            if size > _MAX_ITEMS:
                node["truncated"] = True
```

## 第 6 次调用：edit #5 —— string
原文：
```
        if "string" in type_name:
            summary = value.GetSummary() or ""
            text = summary.strip('"')
            node.update(kind="text", value=text, chars=list(text))
            return node
```
改为：
```
        if "string" in type_name:
            summary = value.GetSummary() or ""
            text = summary.strip('"')
            node.update(kind="text", value=text[:_MAX_ITEMS], chars=list(text[:_MAX_ITEMS]))
            if len(text) > _MAX_ITEMS:
                node["truncated"] = True
            return node
```

## 第 7 次调用：edit #6 —— memory.js 画布单元格上限
原文：
```
  function renderCells(items, capacity, prevItems) {
    const list = Array.isArray(items) ? items : [];
```
改为：
```
  const MAX_CELLS = 24;

  function renderCells(items, capacity, prevItems) {
    const raw = Array.isArray(items) ? items : [];
    /* Huge arrays must not become a 10k-pixel-wide row: draw the head only. */
    const list = raw.length > MAX_CELLS ? raw.slice(0, MAX_CELLS) : raw;
```

## 第 8 次调用：检查（只允许这三条）
```
python3 -m py_compile tracer/tracer.py      → 无输出、退出码 0
node --check src/main/resources/web/memory.js → 无输出、退出码 0
./build.sh                                   → 期望 build ok
```

## 收工
总结 ≤2 行：6 处是否完成、三条检查结果。不要写别的。
