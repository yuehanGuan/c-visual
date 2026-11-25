【T-11.2】崩溃行标红（只改 app.js，1 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `app.js` 的 `handleResult` 里 `result.outcome === 'crash'` 分支；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景
崩溃时只有 banner，没有指出是哪一行。最后一步的 `line` 就是崩溃发生的位置，
复用 `CppEditor.setErrorLines([line])` 把它标红（播放视图的 `.errline`）。

## 第 1 次调用：read `handleResult` 里 crash 分支

## 第 2 次调用：edit
原文：
```
    } else if (result.outcome === 'crash') {
      showBanner(`程序异常终止（退出码 ${result.exitCode}），例如数组越界或空指针访问。`
        + deepRecursionNote(), true);
```
改为：
```
    } else if (result.outcome === 'crash') {
      const crashLine = (state.steps[state.steps.length - 1] || {}).line;
      if (crashLine) CppEditor.setErrorLines([crashLine]);
      showBanner(`程序异常终止（退出码 ${result.exitCode}）`
        + (crashLine ? `：崩溃发生在第 ${crashLine} 行附近（已标红）`
                     : '，例如数组越界或空指针访问')
        + '。' + deepRecursionNote(), true);
```

## 第 3 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
