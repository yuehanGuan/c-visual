【T-9.2】全局变量只在最内层帧出现一次（只改 tracer/tracer.py，1 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 的 `_frame_vars` 开头；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `python3 -m py_compile`。

## 背景（实测）
八皇后 n=8：`a[20],b[20],c[40],d[40]` 是文件级全局数组。现在每个帧的 `GetVariables`
都把全局带上（statics=True），于是 8 层帧 × 4 个数组 ≈ 960 项/步 → 1641 步 = 16MB、
30s 硬超时。全局在每一帧里重复出现也没有意义（同一块内存）。
修法：最内层帧（depth == 0）才带 statics/globals，其它帧只取 args+locals。

## 第 1 次调用：read `_frame_vars` 开头（`values = frame.GetVariables(...)` 那行）

## 第 2 次调用：edit —— 按 depth 决定是否带 statics
原文：
```
    values = frame.GetVariables(True, True, True, True)
```
改为：
```
    # Globals/statics are the same memory in every frame; only the innermost
    # frame carries them, otherwise 8 queues x 8 frames multiplies the trace.
    values = frame.GetVariables(True, True, depth == 0, True)
```

## 第 3 次调用：检查（只允许这一条）
```
python3 -m py_compile tracer/tracer.py     → 无输出、退出码 0
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
