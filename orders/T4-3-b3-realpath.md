【T-4.3】修 B3：断点路径同时试 abspath 与 realpath（只改 tracer/tracer.py，3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `bootstrap()`；不读别的文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile tracer/tracer.py`。

## 背景（实测）
源码在 `/tmp/...`（macOS 上 `/tmp` 是 `/private/tmp` 的符号链接）时：
- `realpath()` 把 VIZ_SRC 变成 `/private/tmp/...`，而二进制调试信息里是 `/tmp/...` → **断点 0 个**
- lldb 直接 `breakpoint set -f /tmp/b3/src.cpp -l 3` 可以命中；换成 `/private/tmp/...` 则 "no locations"
修法：建断点时先试 `abspath`，没有命中再试 `realpath`。

## 第 1 次调用：read `bootstrap()` 全段（约第 676–735 行）

## 第 2 次调用：edit #1 —— 保留原始绝对路径
原文：
```
    _src = os.path.realpath(os.environ.get("VIZ_SRC", ""))
    _src_name = os.path.basename(_src)
    _max_steps = int(os.environ.get("VIZ_MAX_STEPS", "5000"))
```
改为：
```
    raw_src = os.path.abspath(os.environ.get("VIZ_SRC", ""))
    _src = os.path.realpath(raw_src)
    _src_name = os.path.basename(_src)
    _max_steps = int(os.environ.get("VIZ_MAX_STEPS", "5000"))
```

## 第 3 次调用：edit #2 —— 断点循环包一层候选路径（注意缩进整体 +4）
原文：
```
    placed = 0
    duplicates = 0
    seen = set()
    for line in range(1, total_lines + 1):
        bp = target.BreakpointCreateByLocation(_src, line)
        if not bp.IsValid() or bp.GetNumLocations() == 0:
            if bp.IsValid():
                target.BreakpointDelete(bp.GetID())
            continue
        key = _addr_key(bp)
        if key is not None:
            if key in seen:
                target.BreakpointDelete(bp.GetID())
                duplicates += 1
                continue
            seen.add(key)
        bp.SetScriptCallbackFunction(__name__ + "._on_hit")
        placed += 1
```
改为：
```
    # The debug info records the path as it was compiled, which may be the
    # /tmp form while realpath() gives /private/tmp on macOS.  Try both.
    candidates = []
    for candidate in (raw_src, _src):
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    placed = 0
    duplicates = 0
    used = ""
    for candidate in candidates:
        placed = 0
        duplicates = 0
        seen = set()
        for line in range(1, total_lines + 1):
            bp = target.BreakpointCreateByLocation(candidate, line)
            if not bp.IsValid() or bp.GetNumLocations() == 0:
                if bp.IsValid():
                    target.BreakpointDelete(bp.GetID())
                continue
            key = _addr_key(bp)
            if key is not None:
                if key in seen:
                    target.BreakpointDelete(bp.GetID())
                    duplicates += 1
                    continue
                seen.add(key)
            bp.SetScriptCallbackFunction(__name__ + "._on_hit")
            placed += 1
        used = candidate
        if placed:
            break
```

## 第 4 次调用：edit #3 —— meta 里记录实际用的路径
原文：
```
            "t": "meta",
            "src": _src,
            "engine": "lldb",
```
改为：
```
            "t": "meta",
            "src": _src,
            "srcUsed": used,
            "engine": "lldb",
```

## 第 5 次调用：检查（只允许这一条）
```
python3 -m py_compile tracer/tracer.py     → 无输出、退出码 0
```

## 收工
总结 ≤2 行：3 处是否完成、py_compile 结果。不要写别的。
