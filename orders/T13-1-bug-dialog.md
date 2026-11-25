【T-13.1】软件内「反馈问题」窗口（改 index.html + app.js + style.css，共 7 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 index.html 的 dialog 段与工具条、app.js 的 showDialog/bind/init、style.css 的 .dialog 段；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
反馈邮箱：**13076662816@163.com**；GitHub Issues：https://github.com/yuehanGuan/c-visual/issues/new

## 目标
工具条加「反馈」按钮 → 弹出窗口，自动带版本/系统/当前代码/输入/错误 banner，
三个按钮：复制、发邮件（mailto）、关闭。

## 第 1 次调用：read 三段（dialog 段、工具条 clearRuns 行、bind/init 里 exportTrace 行）

## 第 2 次调用：edit #1 —— index.html 工具条加按钮
原文：
```
    <button id="clearRuns" class="ghost" title="删除 ~/.cppviz/runs 下的历史记录">清空历史</button>
```
改为：
```
    <button id="bugBtn" class="ghost" title="反馈问题（13076662816@163.com）">反馈</button>
    <button id="clearRuns" class="ghost" title="删除 ~/.cppviz/runs 下的历史记录">清空历史</button>
```

## 第 3 次调用：edit #2 —— index.html 在 `<div id="dialog"` 之前插入反馈窗口
```
<div id="bugDialog" class="dialog hidden">
  <div class="dialog-box bug-box">
    <h3>反馈问题</h3>
    <p class="bug-hint">
      复制下面的内容发到 <a href="mailto:13076662816@163.com">13076662816@163.com</a>，
      或到 <a href="https://github.com/yuehanGuan/c-visual/issues/new" target="_blank" rel="noopener">GitHub Issues</a> 提交。
    </p>
    <textarea id="bugReport" class="bug-report" readonly spellcheck="false"></textarea>
    <div class="dialog-actions">
      <button id="bugCopy" class="ghost">复制</button>
      <button id="bugMail" class="primary">发邮件</button>
      <button id="bugClose" class="ghost">关闭</button>
    </div>
  </div>
</div>

```

## 第 4 次调用：edit #3 —— app.js：版本号 + 模板 + 三个动作（放在 `function showDialog` 之后）
```
  const APP_VERSION = 'v1.0.0';
  const BUG_MAIL = '13076662816@163.com';

  function bugTemplate() {
    const code = (CppEditor.getValue() || '').trim();
    const input = el.stdin && el.stdin.value ? el.stdin.value.trim() : '';
    const banner = el.banner && !el.banner.classList.contains('hidden')
      ? el.banner.textContent.trim() : '';
    const lines = [
      '【c可视 问题反馈】',
      '版本：' + APP_VERSION,
      '系统：' + (navigator.platform || '?') + ' / ' + (navigator.userAgent || '?'),
      '',
      '问题描述：',
      '（做了什么、期望什么、实际什么）',
      '',
      '复现代码：',
      code || '（粘贴代码）',
    ];
    if (input) {
      lines.push('', '输入数据（stdin）：', input);
    }
    if (banner) {
      lines.push('', '错误信息：', banner);
    }
    return lines.join('\n');
  }

  function openBugDialog() {
    el.bugReport.value = bugTemplate();
    el.bugDialog.classList.remove('hidden');
    el.bugReport.focus();
    el.bugReport.select();
  }

  function closeBugDialog() {
    el.bugDialog.classList.add('hidden');
  }

  async function copyBugReport() {
    try {
      await navigator.clipboard.writeText(el.bugReport.value);
    } catch (ignored) {
      el.bugReport.select();
      document.execCommand('copy');
    }
    el.bugCopy.textContent = '已复制';
    setTimeout(() => { el.bugCopy.textContent = '复制'; }, 1500);
  }

  function mailBugReport() {
    const subject = encodeURIComponent('c可视 问题反馈');
    const body = encodeURIComponent((el.bugReport.value || '').slice(0, 1800));
    window.location.href = 'mailto:' + BUG_MAIL + '?subject=' + subject + '&body=' + body;
  }

```

## 第 5 次调用：edit #4 —— app.js：bind 挂事件（放在 `el.exportTrace.addEventListener('click', exportTrace);` 之后）
```
    el.bugBtn.addEventListener('click', openBugDialog);
    el.bugClose.addEventListener('click', closeBugDialog);
    el.bugCopy.addEventListener('click', copyBugReport);
    el.bugMail.addEventListener('click', mailBugReport);
    el.bugDialog.addEventListener('click', (event) => {
      if (event.target === el.bugDialog) closeBugDialog();
    });
```

## 第 6 次调用：edit #5 —— app.js：init 引用（放在 `el.exportTrace = $('exportTrace');` 之后）
```
    el.bugBtn = $('bugBtn');
    el.bugDialog = $('bugDialog');
    el.bugReport = $('bugReport');
    el.bugCopy = $('bugCopy');
    el.bugMail = $('bugMail');
    el.bugClose = $('bugClose');
```

## 第 7 次调用：edit #6 —— style.css 末尾
```
/* ---------- bug report ---------- */
.bug-box { max-width: 560px; }
.bug-hint { font-size: 12.5px; line-height: 1.6; }
.bug-hint a { color: var(--accent); }
.bug-report { width: 100%; height: 180px; margin-bottom: 12px; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: 12px var(--mono); resize: vertical; }
```

## 第 8 次调用：检查
```
node --check src/main/resources/web/app.js   → 无输出、退出码 0
./build.sh                                     → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
