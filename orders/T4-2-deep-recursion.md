【T-4.2】深递归/栈溢出提示（只改 app.js，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `app.js` 的 `handleResult` 与 `showDialog` 附近；不读别的文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/app.js` 与 `./build.sh`。

## 背景（实测）
`char buf[1<<16]` 的无限递归：栈上 64 层全是 `deep(int)`（帧数被 `_max_frames=64` 截断），
但 lldb 侧表现为空闲超时 → 前端拿到 `outcome: "runtime_timeout"`，
banner 却说"通常意味着死循环"，对用户是误导。目标：识别"最后一帧栈几乎全是同一个函数"，
在超时/崩溃文案里补一句人话。

## 第 1 次调用：read 两段
- `app.js` 第 250–275 行（`handleResult` 的 banner 分支）
- 同文件 `function showDialog(` 附近（用于插入新函数的位置）

## 第 2 次调用：edit #1 —— 新增判定函数（放在 `function showDialog(` 之前）
```
  /* Deep recursion often looks like a timeout or a crash: the last recorded
   * step has many identical frames.  Name it instead of blaming a dead loop. */
  function deepRecursionNote() {
    const last = state.steps[state.steps.length - 1];
    const frames = (last && last.frames) || [];
    if (frames.length < 16) return '';
    const fn = frames[0].fn;
    const same = frames.filter((f) => f.fn === fn).length;
    if (same < frames.length * 0.8) return '';
    return `；栈上至少有 ${frames.length} 层 ${fn}，看起来是递归太深 / 栈溢出`;
  }

```

## 第 3 次调用：edit #2 —— 超时文案
原文：
```
    if (result.outcome === 'runtime_timeout') {
      showBanner('运行超时：程序在限定时间内没有结束，通常意味着死循环。已保留最后的执行记录。', true);
```
改为：
```
    if (result.outcome === 'runtime_timeout') {
      showBanner('运行超时：程序在限定时间内没有结束（通常意味着死循环）。已保留最后的执行记录。'
        + deepRecursionNote(), true);
```

## 第 4 次调用：edit #3 —— 崩溃文案
原文：
```
    } else if (result.outcome === 'crash') {
      showBanner(`程序异常终止（退出码 ${result.exitCode}），例如数组越界或空指针访问。`, true);
```
改为：
```
    } else if (result.outcome === 'crash') {
      showBanner(`程序异常终止（退出码 ${result.exitCode}），例如数组越界或空指针访问。`
        + deepRecursionNote(), true);
```

## 第 5 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                      → 期望 build ok
```

## 收工
总结 ≤2 行：3 处是否完成、两条检查结果。不要写别的。
