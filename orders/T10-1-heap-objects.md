【T-10.1】把 new 出来的堆对象收进 trace（只改 tracer/tracer.py，3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `_ptr_target` / `_is_record` / `_frame_vars` 末尾 / `_on_hit`；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile`。

## 背景（实测）
链表程序（3 个 `new Node`）：`step.heap` 里 **0 个块**，`head` 指向的 `0x1005b9230`
在界面里不存在，只能显示 `?`。原因：heap 只收 vector/deque 的缓冲区。
目标：从"用户指针变量 + 记录里的指针字段"出发，沿指针把堆上的用户结构体（Node 等）
收集成 heap 块（`kind:"record"`，带 fields），供前端平铺展示。

## 第 1 次调用：read 三段
- `tracer/tracer.py` 的 `def _ptr_target` 与 `def _is_record`
- `_frame_vars` 末尾 `nodes.append(_node(value, heap))`
- `_on_hit` 里 `heap = []` / `_dump_frames(...)` 那段

## 第 2 次调用：edit #1 —— 模块状态与上限（放在 `_MAX_ITEMS = 200` 之后）
```
# Heap objects reachable from user pointers (linked lists, trees, ...):
# lldb knows no "malloc list", so we walk pointer targets we can see.
_MAX_HEAP_NODES = 64
_heap_roots = []

```

## 第 3 次调用：edit #2 —— `_frame_vars` 记录指针根
原文：
```
        nodes.append(_node(value, heap))
```
改为：
```
        node = _node(value, heap)
        if node.get("kind") == "ptr" and node.get("target") not in (None, "", "0x0"):
            _heap_roots.append(value)
        elif node.get("kind") == "record":
            # A stack record can own the head pointer too (Node n; n.next).
            try:
                for i in range(value.GetNumChildren()):
                    child = value.GetChildAtIndex(i)
                    if child.GetType().IsPointerType():
                        _heap_roots.append(child)
            except Exception:
                pass
        nodes.append(node)
```

## 第 4 次调用：edit #3 —— 新增 `_expand_heap`（放在 `_dump_frames` 之前）
```
def _expand_heap(heap):
    """Walk pointer targets and append user record objects as heap blocks.

    Bounded by _MAX_HEAP_NODES and a visited set, so cyclic lists/trees stop."""
    seen = set()
    for block in heap:
        addr = block.get("addr")
        if addr:
            seen.add(addr)
    queue = list(_heap_roots)
    count = 0
    while queue and count < _MAX_HEAP_NODES:
        value = queue.pop(0)
        try:
            target = _ptr_target(value)
        except Exception:
            continue
        if not target or target == "0x0" or target in seen:
            continue
        try:
            pointee = value.Dereference()
        except Exception:
            continue
        if not pointee or not pointee.IsValid():
            continue
        vtype = pointee.GetType()
        if not _is_record(vtype):
            continue
        if "std::" in (vtype.GetName() or ""):
            continue
        seen.add(target)
        count += 1
        node = _node(pointee, None)
        node["addr"] = target
        node["kind"] = "record"
        heap.append(node)
        try:
            for i in range(pointee.GetNumChildren()):
                child = pointee.GetChildAtIndex(i)
                if child.GetType().IsPointerType():
                    queue.append(child)
        except Exception:
            pass


```

## 第 5 次调用：edit #4 —— `_on_hit` 声明 global、每步重置根、展开堆对象
原文：
```
    global _steps
```
改为：
```
    global _steps, _heap_roots
    _heap_roots = []
```

## 第 6 次调用：edit #5 —— `_on_hit` 展开堆对象
原文：
```
    heap = []
    try:
        frames = _dump_frames(frame.GetThread(), heap)
    except Exception:
        frames = []
```
改为：
```
    heap = []
    try:
        frames = _dump_frames(frame.GetThread(), heap)
    except Exception:
        frames = []
    try:
        _expand_heap(heap)
    except Exception:
        pass
```

## 第 7 次调用：检查（只允许这一条）
```
python3 -m py_compile tracer/tracer.py     → 无输出、退出码 0
```

## 收工
总结 ≤2 行：5 处是否完成、检查结果。不要写别的。
