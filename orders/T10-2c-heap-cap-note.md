【T-10.2c】堆对象上限的提示（改 tracer + memory.js + style.css，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `_expand_heap`/`_on_hit` 与 `memory.js` 的 `renderHeapPanel`；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile`、`node --check`、`./build.sh`。
✅ 实测 200 节点链表：每步最多 64 个堆块（上限），但界面没有任何"被截断"的提示。

## 第 1 次调用：edit #1 —— tracer：`_expand_heap` 返回是否截断
原文：
```
    while queue and count < _MAX_HEAP_NODES:
```
在函数末尾（`        except Exception:\n            pass` 之后、`def _dump_frames` 之前）加：
```
    return count >= _MAX_HEAP_NODES and bool(queue)
```
并把函数签名那行保持不动；**同时**在 `_on_hit` 里接收返回值并写进 step。

## 第 2 次调用：edit #2 —— `_on_hit`：把标记写进 step
原文：
```
    try:
        _expand_heap(heap)
    except Exception:
        pass
```
改为：
```
    heap_truncated = False
    try:
        heap_truncated = _expand_heap(heap)
    except Exception:
        pass
```
再在 `_emit({...})` 的 step 字典里、`"heap": heap,` 之前加一行：
```
            "heapTruncated": heap_truncated,
```

## 第 3 次调用：edit #3 —— memory.js：面板底部提示
在 `renderHeapPanel` 的 `container.innerHTML = rows.join('');` 之前：
```
    if (step && step.heapTruncated) {
      rows.push('<p class="heap-more">（只显示前 64 个堆对象，链表/树太大）</p>');
    }
```
（放在 `rows.push` 之后、赋值之前）

## 第 4 次调用：edit #4 —— style.css 加一行
```
.heap-more { margin: 6px 0 0; font: 11px var(--mono); color: var(--muted); }
```

## 第 5 次调用：检查（只允许这三条）
```
python3 -m py_compile tracer/tracer.py          → 无输出、退出码 0
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
