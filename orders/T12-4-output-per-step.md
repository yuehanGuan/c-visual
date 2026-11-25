【T-12.4】输出按步显示（改 LldbEngine.java + tracer.py + app.js，共 4 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `LldbEngine.java` 的 env 设置、`tracer/tracer.py` 的 `_on_hit` 开头与 step 字典、`app.js` 的 `goTo` 末尾；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`、`python3 -m py_compile`、`node --check`。
✅ 已实测：`frame.EvaluateExpression("(int)fflush((void*)0)")` 每 8 步一次，深递归 2002 步 17.6s→20.8s（仍 <30s），
输出文件会按 8 步粒度增长。

## 目标
tracer 每步带上 `out`（当前 stdout 已落盘字节数，每 8 步 flush 一次）；前端按 `step.out`
截取输出前缀，非最后一步也能看到"已经打印了什么"（旧 trace 没有 out 字段，保持原行为）。

## 第 1 次调用：read 三段
- `LldbEngine.java` 里 `builder.environment().put("VIZ_MAX_STEPS", ...)` 那行
- `tracer/tracer.py` 的 `_on_hit` 开头（`_steps += 1`）与 `_emit({...})` 的 step 字典
- `app.js` 的 `goTo` 里 `const atEnd = ...` 与 `el.programOutput.textContent = ...`

## 第 2 次调用：edit #1 —— LldbEngine：把输出文件路径传给 tracer
原文：
```
        builder.environment().put("VIZ_MAX_STEPS", String.valueOf(maxSteps));
```
改为：
```
        builder.environment().put("VIZ_MAX_STEPS", String.valueOf(maxSteps));
        builder.environment().put("VIZ_OUT", programOut.toString());
```

## 第 3 次调用：edit #2 —— tracer：每 8 步 flush + `_output_size()` 辅助
原文：
```
    _steps += 1
```
改为：
```
    _steps += 1
    if _steps % 8 == 0:
        # stdout is block-buffered when redirected to a file, so the UI would
        # only see output at exit.  Flush every 8 steps: cheap enough (~1 ms
        # per step on deep stacks) and the display lags by at most 8 steps.
        try:
            frame.EvaluateExpression("(int)fflush((void*)0)")
        except Exception:
            pass
```
在 `def _on_hit(frame, bp_loc, *rest):` 之前加：
```
def _output_size():
    """Bytes of program stdout written so far, or -1 when unknown."""
    path = os.environ.get("VIZ_OUT", "")
    if not path:
        return -1
    try:
        return os.path.getsize(path)
    except OSError:
        return -1


```

## 第 4 次调用：edit #3 —— tracer：step 带 out
原文：
```
            "heap": heap,
            "framesTruncated": frames_truncated,
```
改为：
```
            "heap": heap,
            "framesTruncated": frames_truncated,
            "out": _output_size(),
```

## 第 5 次调用：edit #4 —— app.js：按 out 截取
在 `function goTo(index) {` 之前加：
```
  /* Trace stdout is a growing byte count; show only what has been printed. */
  function outputText(bytes) {
    const full = state.programOutput || '';
    if (typeof bytes !== 'number' || bytes < 0) return full;
    if (bytes === 0) return '';
    try {
      const encoded = new TextEncoder().encode(full);
      return new TextDecoder().decode(encoded.slice(0, bytes));
    } catch (ignored) {
      return full.slice(0, bytes);
    }
  }

```
原文：
```
    const atEnd = clamped === state.steps.length - 1;
    el.programOutput.textContent = atEnd ? (state.programOutput || '') : '（程序运行结束后显示）';
```
改为：
```
    const atEnd = clamped === state.steps.length - 1;
    if (atEnd) {
      el.programOutput.textContent = state.programOutput || '';
    } else if (step && step.out !== undefined) {
      el.programOutput.textContent = outputText(step.out);
    } else {
      el.programOutput.textContent = '（程序运行结束后显示）';
    }
```

## 第 6 次调用：检查（只允许这三条）
```
./build.sh                                       → 期望 build ok
python3 -m py_compile tracer/tracer.py          → 无输出、退出码 0
node --check src/main/resources/web/app.js      → 无输出、退出码 0
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
