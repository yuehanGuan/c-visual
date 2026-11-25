【T-9.1】深递归性能：不再每步全栈展开（只改 tracer/tracer.py，2 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `_max_frames` 与 `_dump_frames` 开头；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile`。

## 背景（实测）
`f(2000)` 递归、2002 步：
- 现状 **48.5s**（应用 30s 超时 → `runtime_timeout`，只走到 1459 步）
- 只把 `thread.GetNumFrames()` 换掉（它每步把整条栈展开一遍）→ **25.5s**
- 再把帧上限 64→32 → **18.3s**（trace 16MB→7.9MB）
目标：这两处都改，让 2000 层递归在 30s 内跑完。

## 第 1 次调用：read 两段
- `tracer/tracer.py` 第 38–45 行（`_max_frames`）
- `_dump_frames` 开头（`frames = []` 到 `for index in range(total):` 那几行）

## 第 2 次调用：edit #1 —— 帧上限 64 → 32
原文：
```
_max_frames = 64
```
改为：
```
# 64 frames x every step blew a 2000-deep recursion past the 30s budget;
# 32 keeps the visible stack useful and halves the trace size.
_max_frames = 32
```

## 第 3 次调用：edit #2 —— 不再每步全栈展开
原文：
```
    frames = []
    alive = set()
    try:
        total = min(thread.GetNumFrames(), _max_frames)
    except Exception:
        total = 1
    for index in range(total):
        try:
            frame = thread.GetFrameAtIndex(index)
            if not _is_user_frame(frame):
                continue
```
改为：
```
    frames = []
    alive = set()
    # Do NOT call thread.GetNumFrames(): it unwinds the *whole* stack on every
    # step, which turns a 2000-deep recursion into ~25 ms/step.  Walk at most
    # _max_frames frames and stop at the first invalid one.
    for index in range(_max_frames):
        try:
            frame = thread.GetFrameAtIndex(index)
            if not frame or not frame.IsValid():
                break
            if not _is_user_frame(frame):
                continue
```

## 第 4 次调用：检查（只允许这一条）
```
python3 -m py_compile tracer/tracer.py     → 无输出、退出码 0
```

## 收工
总结 ≤2 行：两处是否完成、检查结果。不要写别的。
