【T-14.2】前端：启动自检 + 友好报错 + 反馈里带工具链状态（只改 app.js，共 4 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `app.js` 的 `engine_error` 分支、`bugTemplate`、`init` 末尾、状态区；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景
`GET /api/env` 已就绪：`{os, java, clang:{found,version}, lldb:{found,version}}`。
现在没有工具链时界面只显示 `追踪引擎出错：java.io.IOException: Cannot run program "clang++"...`。

## 第 1 次调用：edit #1 —— 状态变量 + `checkEnv()`
在 `let dialogOnOk = null;` 之前加：
```
  let envCache = null;

  /* Probe the local toolchain once and explain what is missing. */
  async function checkEnv() {
    try {
      envCache = await (await fetch('/api/env')).json();
    } catch (ignored) {
      return;
    }
    const missing = [];
    if (!envCache.clang || !envCache.clang.found) missing.push('clang++');
    if (!envCache.lldb || !envCache.lldb.found) missing.push('lldb');
    if (!missing.length) return;
    const mac = /mac/i.test(envCache.os || '');
    const hint = mac
      ? '在终端运行：xcode-select --install'
      : '安装 LLVM（llvm.org）并把它的 bin 目录加进 PATH';
    showBanner('缺少 ' + missing.join(' / ') + '，无法编译或调试 C++。' + hint, true);
  }

```

## 第 2 次调用：edit #2 —— `engine_error` 分支友好化
原文：
```
      case 'engine_error':
        showBanner(`追踪引擎出错：${result.msg || '未知原因'}`);
        return;
```
改为：
```
      case 'engine_error': {
        const message = result.msg || '未知原因';
        if (/Cannot run program/i.test(message) || /No such file/i.test(message)) {
          showBanner('找不到 C++ 工具链（clang++ / lldb）。macOS：xcode-select --install；Windows：安装 LLVM 并加入 PATH。');
        } else {
          showBanner(`追踪引擎出错：${message}`);
        }
        return;
      }
```

## 第 3 次调用：edit #3 —— 反馈报告里带工具链状态
原文：
```
      '系统：' + (navigator.platform || '?') + ' / ' + (navigator.userAgent || '?'),
```
改为：
```
      '系统：' + (navigator.platform || '?') + ' / ' + (navigator.userAgent || '?'),
      '工具链：' + (envCache
        ? 'clang ' + (envCache.clang && envCache.clang.found ? '✓' : '✗')
          + ' / lldb ' + (envCache.lldb && envCache.lldb.found ? '✓' : '✗')
        : '未知'),
```

## 第 4 次调用：edit #4 —— init 末尾调用自检
原文：
```
    if (hash.has('run')) {
```
改为：
```
    checkEnv();
    if (hash.has('run')) {
```

## 第 5 次调用：检查
```
node --check src/main/resources/web/app.js   → 无输出、退出码 0
./build.sh                                     → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
