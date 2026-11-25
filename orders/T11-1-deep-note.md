【T-11.1】深栈截断提示（tracer + memory.js + style.css，共 4 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `_dump_frames`/`_on_hit`、`memory.js` 的 `render()` 头部、`style.css` 的 `.mem-*`；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile`、`node --check`、`./build.sh`。

## 背景
`_max_frames=32` 会静默截断深栈（用户不知道还有更多层）。修：`_dump_frames` 返回是否截断，
step 带 `framesTruncated`，记忆图标题右侧显示「仅显示最近 32 层」。

## 第 1 次调用：read 两段
- `tracer/tracer.py` 的 `_dump_frames` 全段与 `_on_hit` 里 `frames = _dump_frames(...)` 那段
- `memory.js` 的 `render()` 里 `const head = ...` 那行

## 第 2 次调用：edit #1 —— `_dump_frames` 记录是否走到末尾
原文：
```
    frames = []
    alive = set()
```
改为：
```
    frames = []
    alive = set()
    saw_end = False
    last_index = -1
```
原文：
```
    for index in range(_max_frames):
        try:
            frame = thread.GetFrameAtIndex(index)
            if not frame or not frame.IsValid():
                break
```
改为：
```
    for index in range(_max_frames):
        last_index = index
        try:
            frame = thread.GetFrameAtIndex(index)
            if not frame or not frame.IsValid():
                saw_end = True
                break
```
原文（函数末尾）：
```
    for key in list(_prev_vars):
        if key not in alive:
            del _prev_vars[key]
    return frames
```
改为：
```
    for key in list(_prev_vars):
        if key not in alive:
            del _prev_vars[key]
    truncated = (not saw_end) and last_index == _max_frames - 1
    return frames, truncated
```

## 第 3 次调用：edit #2 —— `_on_hit` 接收并写进 step
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
    frames_truncated = False
    try:
        frames, frames_truncated = _dump_frames(frame.GetThread(), heap)
    except Exception:
        frames = []
```
原文（step 字典里）：
```
            "heap": heap,
```
改为：
```
            "heap": heap,
            "framesTruncated": frames_truncated,
```

## 第 4 次调用：edit #3 —— memory.js 标题右侧提示
原文：
```
    const head = `<text class="mem-title" x="16" y="20">栈</text>`;
```
改为：
```
    const head = `<text class="mem-title" x="16" y="20">栈</text>` +
      (step && step.framesTruncated
        ? `<text class="mem-note" x="${width - 16}" y="20" text-anchor="end">仅显示最近 ${frames.length} 层</text>`
        : '');
```

## 第 5 次调用：edit #4 —— style.css
在 `.mem .mem-title` 规则之后加：
```
.mem .mem-note { font: 11px var(--mono); fill: var(--muted); }
```

## 第 6 次调用：检查（只允许这三条）
```
python3 -m py_compile tracer/tracer.py          → 无输出、退出码 0
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
