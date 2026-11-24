【T-1b】修帧键：`GetFP()` 在叶子函数里会和调用者撞车，改用 `GetCFA()`（只改 tracer/tracer.py 一处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 第 489–497 行；不要读别的文件。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh**；只允许 `python3 -m py_compile tracer/tracer.py`。

## 背景（实测数据，直接照做）
上一单用 `frame.GetFP()` 作守卫键，但**叶子函数不建自己的 frame record**（AArch64
可直接复用调用者的 x29），实测 `void bump(int*)` 与 `main` 的 GetFP() 都是
`6171913568`，两帧共用同一个键 → 外层 main 的已初始化变量被误标"（声明中…）"。
实测 `GetCFA()` 逐帧唯一且跨步稳定：bump CFA=…3520、main CFA=…3584、start CFA=…5216。

## 第 1 次调用：read `tracer/tracer.py` 第 489–497 行（只读这一段）

## 第 2 次调用：edit —— 整个 `_frame_key` 函数替换
原文：
```
def _frame_key(frame, depth):
    """Stable per-activation key: the frame pointer; depth as fallback."""
    try:
        fp = frame.GetFP() or frame.GetSP()
    except Exception:
        fp = 0
    return fp if fp else ("depth", depth)
```
改为：
```
def _frame_key(frame, depth):
    """Stable per-activation key: canonical frame address; depth fallback.

    GetFP() cannot be used: a leaf function may reuse its caller's frame
    record, so two activations can report the same FP and merge their guard
    state.  GetCFA() is unique per activation and stable across steps.
    """
    try:
        cfa = frame.GetCFA()
    except Exception:
        cfa = 0
    return cfa if cfa else ("depth", depth)
```

## 第 3 次调用：检查（只允许这一条）
```
python3 -m py_compile tracer/tracer.py     → 期望：无输出，退出码 0
```

## 收工
总结 ≤2 行：edit 是否完成、py_compile 结果。不要写别的。
