【T-12.3】代码持久化 + 导出 trace（改 index.html + app.js，共 7 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 工具条、`app.js` 的 init/run/bind/loadTrace；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 目标
1. 编辑器内容存 localStorage（`cppviz.code`），刷新后自动恢复（有 `#sample=` 深链时以示例为准）
2. 工具条加「导出」按钮：把当前回放的 `trace.jsonl` 下载下来

## 第 1 次调用：read 三段
- `index.html` 的工具条（`clearRuns` 那行）
- `app.js` 的 `async function loadTrace(traceId) {` 开头、`async function run()` 开头、`init()` 里 `CppEditor.setValue(SAMPLES.basic);`
- `app.js` 的 `bind()` 里 `el.clearRuns.addEventListener`

## 第 2 次调用：edit #1 —— index.html：工具条加导出
原文：
```
    <button id="clearRuns" class="ghost" title="删除 ~/.cppviz/runs 下的历史记录">清空历史</button>
```
改为：
```
    <button id="exportTrace" class="ghost" title="下载当前回放的 trace.jsonl">导出</button>
    <button id="clearRuns" class="ghost" title="删除 ~/.cppviz/runs 下的历史记录">清空历史</button>
```

## 第 3 次调用：edit #2 —— app.js：记住 traceId 与代码
原文：
```
  async function loadTrace(traceId) {
```
改为：
```
  async function loadTrace(traceId) {
    state.traceId = traceId;
```
在 `async function run() {` 的 `stashStdin();` 之后加：
```
    stashCode();
```
在模块状态区（`let dialogOnOk = null;` 之前）加：
```
  const CODE_KEY = 'cppviz.code';
  let codeTimer = 0;

  function stashCode() {
    try {
      localStorage.setItem(CODE_KEY, CppEditor.getValue());
    } catch (ignored) {
      // private mode: code just won't persist
    }
  }

```

## 第 4 次调用：edit #3 —— app.js：导出函数（放在 `async function openRun(id)` 之后）
```
  /* Download the current trace as the raw JSONL the engine wrote. */
  async function exportTrace() {
    const id = state.traceId;
    if (!id) {
      el.status.textContent = '还没有可导出的 trace';
      return;
    }
    try {
      const response = await fetch('/api/trace/' + id);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = id + '.jsonl';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      el.status.textContent = '已导出 ' + id + '.jsonl';
    } catch (failure) {
      el.status.textContent = '导出失败：' + failure;
    }
  }

```

## 第 5 次调用：edit #4 —— app.js：bind 里挂导出 + 编辑器输入防抖存代码
在 `    el.clearRuns.addEventListener('click', () => {` 之前插入：
```
    el.exportTrace.addEventListener('click', exportTrace);
    el.source.addEventListener('input', () => {
      if (codeTimer) clearTimeout(codeTimer);
      codeTimer = setTimeout(stashCode, 500);
    });
```

## 第 6 次调用：edit #5 —— app.js：init 里恢复代码
原文：
```
    CppEditor.init();
    CppEditor.setValue(SAMPLES.basic);
```
改为：
```
    CppEditor.init();
    let initialCode = SAMPLES.basic;
    try {
      const saved = localStorage.getItem(CODE_KEY);
      if (saved) initialCode = saved;
    } catch (ignored) {
      // default sample
    }
    CppEditor.setValue(initialCode);
```

## 第 7 次调用：edit #6 —— app.js：init 引用
在 `    el.stdin = $('stdin');` 之后加：
```
    el.source = $('source');
    el.exportTrace = $('exportTrace');
```

## 第 8 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
grep -n "stashCode\|exportTrace\|CODE_KEY" src/main/resources/web/app.js → 各至少 2 处
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
