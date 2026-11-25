【T-15.2】前端：环境条 + 「帮我安装」（改 index.html + app.js + style.css，共 6 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这几处；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 目标
缺工具链时，在 alert banner 下方显示一条常驻「环境条」：
`缺少 clang++ / lldb … [帮我安装] [稍后]`；点安装调 `POST /api/env/install`，
macOS 会弹系统安装窗口，Windows 会打开 LLVM 下载页；然后每 3 秒轮询 `/api/env`，
就绪后自动隐藏并提示"工具链已就绪"。

## 第 1 次调用：edit #1 —— index.html（`<div id="banner" ...>` 之后）
原文：
```
<div id="banner" class="banner hidden"></div>
```
改为：
```
<div id="banner" class="banner hidden"></div>

<div id="envBar" class="envbar hidden">
  <span id="envText"></span>
  <button id="envFix" class="primary">帮我安装</button>
  <button id="envHide" class="ghost">稍后</button>
</div>
```

## 第 2 次调用：edit #2 —— app.js：`checkEnv` 改成显示环境条
原文：
```
    const mac = /mac/i.test(envCache.os || '');
    const hint = mac
      ? '在终端运行：xcode-select --install'
      : '安装 LLVM（llvm.org）并把它的 bin 目录加进 PATH';
    showBanner('缺少 ' + missing.join(' / ') + '，无法编译或调试 C++。' + hint, true);
```
改为：
```
    const mac = /mac/i.test(envCache.os || '');
    el.envText.textContent = '缺少 ' + missing.join(' / ') + '，无法编译或调试 C++。'
      + (mac ? ' 点「帮我安装」调起 Xcode 命令行工具安装。' : ' 点「帮我安装」打开 LLVM 下载页。');
    el.envBar.classList.remove('hidden');
```

## 第 3 次调用：edit #3 —— app.js：`fixEnv` 与 `pollEnv`（放在 `checkEnv` 之后）
```
  /* Guided install: macOS opens the Xcode CLT dialog, Windows opens LLVM. */
  async function fixEnv() {
    el.envFix.disabled = true;
    el.envFix.textContent = '正在处理…';
    try {
      const result = await (await fetch('/api/env/install', { method: 'POST' })).json();
      if (result.message) el.envText.textContent = result.message;
      if (result.url) window.open(result.url, '_blank', 'noopener');
      if (result.ok || result.url) pollEnv(0);
    } catch (failure) {
      el.envText.textContent = '调用失败：' + failure;
    } finally {
      el.envFix.disabled = false;
      el.envFix.textContent = '帮我安装';
    }
  }

  function pollEnv(attempt) {
    if (attempt > 100) return;
    setTimeout(async () => {
      try {
        const env = await (await fetch('/api/env')).json();
        envCache = env;
        const ready = env.clang && env.clang.found && env.lldb && env.lldb.found;
        if (ready) {
          el.envBar.classList.add('hidden');
          el.status.textContent = '工具链已就绪';
          return;
        }
      } catch (ignored) {
        // keep polling
      }
      pollEnv(attempt + 1);
    }, 3000);
  }

```

## 第 4 次调用：edit #4 —— app.js：bind 挂事件（放在 `el.bugBtn.addEventListener('click', openBugDialog);` 之后）
```
    el.envFix.addEventListener('click', fixEnv);
    el.envHide.addEventListener('click', () => el.envBar.classList.add('hidden'));
```

## 第 5 次调用：edit #5 —— app.js：init 引用（放在 `el.bugBtn = $('bugBtn');` 之后）
```
    el.envBar = $('envBar');
    el.envText = $('envText');
    el.envFix = $('envFix');
    el.envHide = $('envHide');
```

## 第 6 次调用：edit #6 —— style.css（放在 `.banner.warn` 之后）
```
.envbar { display: flex; align-items: center; gap: 10px; padding: 7px 16px; background: #2a1d1d; border-bottom: 1px solid #4a2a2a; color: #ffb4a8; font-size: 12.5px; }
.envbar span { flex: 1; }
.envbar button { padding: 3px 10px; font-size: 12px; }
```

## 第 7 次调用：检查
```
node --check src/main/resources/web/app.js   → 无输出、退出码 0
./build.sh                                     → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
