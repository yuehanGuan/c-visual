【T-1】修 B1：声明步守卫按“帧身份”记账（只改 tracer/tracer.py，5 处 edit）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `tracer/tracer.py` 一个文件；不要读 DEVLOG / PLAN / 其他文件。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh**（会卡死整轮，架构师自己验）。
✅ 只允许跑 1 次 `python3 -m py_compile tracer/tracer.py`。

## 背景（已核实，直接照做，不要探索）
B1 根因：守卫表 `_prev_vars` 以“帧序号 depth”为键。递归压栈时旧帧 depth+1，
状态错位：新帧继承父帧的“已见变量”集合 → 未构造的 `std::map` 被当已构造读取，
实测出现 `size: 1876945921` 的幽灵 map；父帧反而误显示“声明中”。
修法：改用 `frame.GetFP()`（帧指针）作键。函数返回后该键不再出现，下一次
调用即使复用同一栈地址也从空集合开始。

## 第 1 次调用：read 工具读第 40–47 行、480–565 行（只读这两段）
不要读全文，不要改其他任何东西。

## 第 2 次调用：edit #1 —— 顶层全局变量（约 42–44 行）
原文：
```
# guard: names seen in the previous step, per frame depth
_prev_vars = {}
_prev_fn = {}
_cur_depth = 0
```
改为：
```
# guard: names seen in the previous step, per live frame activation
_prev_vars = {}
```

## 第 3 次调用：edit #2 —— `_frame_vars` 签名与取 prev（约 482–488 行）
原文：
```
def _frame_vars(frame, heap=None):
    nodes = []
    try:
        values = frame.GetVariables(True, True, True, True)
    except Exception:
        return nodes
    prev = _prev_vars.get(_cur_depth, set())
```
改为：
```
def _frame_key(frame, depth):
    """Stable per-activation key: the frame pointer; depth as fallback."""
    try:
        fp = frame.GetFP() or frame.GetSP()
    except Exception:
        fp = 0
    return fp if fp else ("depth", depth)


def _frame_vars(frame, depth=0, heap=None):
    nodes = []
    try:
        values = frame.GetVariables(True, True, True, True)
    except Exception:
        return nodes
    key = _frame_key(frame, depth)
    prev = _prev_vars.get(key, set())
```

## 第 4 次调用：edit #3 —— `_frame_vars` 末尾写回（约 527 行，只改这一行）
原文：
```
    _prev_vars[_cur_depth] = seen
```
改为：
```
    _prev_vars[key] = seen
```

## 第 5 次调用：edit #4 —— `_dump_frames` 开头（约 538–541 行）
原文：
```
def _dump_frames(thread, heap=None):
    """Frames from the user's own file only; runtime frames are noise."""
    global _cur_depth
    frames = []
```
改为：
```
def _dump_frames(thread, heap=None):
    """Frames from the user's own file only; runtime frames are noise."""
    frames = []
    alive = set()
```

## 第 6 次调用：edit #5 —— `_dump_frames` 循环体与收尾（约 551–561 行）
原文：
```
            depth = len(frames)
            _cur_depth = depth
            if _prev_fn.get(depth) != name:
                _prev_vars[depth] = set()
            _prev_fn[depth] = name
            frames.append(
                {"fn": name, "depth": depth, "vars": _frame_vars(frame, heap)}
            )
        except Exception:
            break
    return frames
```
改为：
```
            depth = len(frames)
            alive.add(_frame_key(frame, depth))
            frames.append(
                {"fn": name, "depth": depth, "vars": _frame_vars(frame, depth, heap)}
            )
        except Exception:
            break
    # Forget activations that have returned: a later call reusing the same
    # stack slot must start with a clean "declaration step" guard.
    for key in list(_prev_vars):
        if key not in alive:
            del _prev_vars[key]
    return frames
```

## 第 7 次调用：只做这两条检查（不要跑程序）
```
grep -n "_cur_depth\|_prev_fn" tracer/tracer.py    → 期望：0 行输出
python3 -m py_compile tracer/tracer.py             → 期望：无输出，退出码 0
```

## 收工
总结 ≤3 行：5 处 edit 是否完成、grep 结果、py_compile 结果。不要写别的。
