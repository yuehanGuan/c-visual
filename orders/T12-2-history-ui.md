【T-12.2】历史运行前端：列表面板 + 一键回放（改 index.html + app.js + style.css，共 7 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 左栏 details、`app.js` 的 expect 函数/init/bind、`style.css` 末尾；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
✅ 后端已就绪：`GET /api/runs` → `{runs:[{id,trace,created,steps,outcome,truncated,lines,preview}]}`；
`GET /api/runs/<id>` → `{id, code, programOutput}`。

## 目标
左栏「期望输出」下面加「历史运行」折叠面板；展开时拉列表（时间 + 步数 + 结果 + 首行代码），
点一项：载入代码 + trace + 输出，切到回放视图。

## 第 1 次调用：read 四段
- `index.html` 的「期望输出」details 结束处
- `app.js` 的 `function initExpect()` 之后（插入位置）
- `app.js` 的 `bind()` 里 `el.expect.addEventListener` 附近、`init()` 里 `initExpect();` 附近
- `style.css` 末尾

## 第 2 次调用：edit #1 —— index.html：加历史面板
原文：
```
    <details class="io">
      <summary>期望输出（可选）</summary>
      <textarea id="expect" spellcheck="false" placeholder="粘贴标准答案，运行后自动对比"></textarea>
    </details>
```
改为：
```
    <details class="io">
      <summary>期望输出（可选）</summary>
      <textarea id="expect" spellcheck="false" placeholder="粘贴标准答案，运行后自动对比"></textarea>
    </details>
    <details class="io" id="historyBox">
      <summary>历史运行</summary>
      <div id="history" class="history-body"><p class="empty">（展开时加载）</p></div>
    </details>
```

## 第 3 次调用：edit #3 —— app.js：两个函数（放在 `function initExpect()` 之后）
```
  /* History: list stored runs and reopen one (code + trace + output). */
  async function loadHistory() {
    if (!el.history) return;
    try {
      const response = await fetch('/api/runs');
      const data = await response.json();
      const rows = (data.runs || []).filter((r) => r.trace).map((r) => {
        const when = new Date(r.created).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const steps = r.steps >= 0 ? r.steps + ' 步' : '';
        const outcome = r.outcome ? ' · ' + r.outcome : '';
        return '<button class="history-item" data-id="' + r.id + '">' +
          '<span class="hi-time">' + when + '</span>' +
          '<span class="hi-meta">' + steps + outcome + '</span>' +
          '<span class="hi-preview">' + Memory.escapeHtml(r.preview || '') + '</span>' +
          '</button>';
      });
      el.history.innerHTML = rows.length ? rows.join('') : '<p class="empty">（还没有可回放的历史）</p>';
    } catch (failure) {
      el.history.innerHTML = '<p class="empty">（加载失败）</p>';
    }
  }

  async function openRun(id) {
    try {
      const detail = await (await fetch('/api/runs/' + id)).json();
      if (detail.code) CppEditor.setValue(detail.code);
      await loadTrace(id);
      state.programOutput = detail.programOutput || '';
      el.programOutput.textContent = '';
      CppEditor.setMode('play');
      el.editBtn.classList.remove('hidden');
      goTo(0);
      checkExpect();
      el.status.textContent = '已载入历史';
    } catch (failure) {
      showBanner('打开历史失败：' + failure);
    }
  }

```

## 第 4 次调用：edit #4 —— app.js：bind 里挂事件
在 `    el.expect.addEventListener('input', () => {` 那一段之后插入：
```
    el.historyBox.addEventListener('toggle', () => {
      if (el.historyBox.open) loadHistory();
    });
    el.history.addEventListener('click', (event) => {
      const button = event.target.closest('.history-item');
      if (button) openRun(button.dataset.id);
    });
```

## 第 5 次调用：edit #5 —— app.js：运行结束后刷新历史（若展开）
原文：
```
    state.programOutput = result.programOutput || '';
    checkExpect();
```
改为：
```
    state.programOutput = result.programOutput || '';
    checkExpect();
    if (el.historyBox && el.historyBox.open) loadHistory();
```

## 第 6 次调用：edit #6 —— app.js：init 引用
- `    el.expect = $('expect');` 之后加：
```
    el.history = $('history');
    el.historyBox = $('historyBox');
```

## 第 7 次调用：edit #7 —— style.css 末尾
```
/* ---------- run history ---------- */
.history-body { max-height: 200px; overflow: auto; padding: 4px 12px 8px; }
.history-body .empty { margin: 4px 0; font-size: 12px; color: var(--muted); }
.history-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; border-bottom: 1px dashed rgba(255, 255, 255, .06); padding: 5px 2px; cursor: pointer; }
.history-item:hover { background: rgba(255, 255, 255, .04); }
.history-item .hi-time { color: var(--muted); font: 11px var(--mono); margin-right: 8px; }
.history-item .hi-meta { color: var(--accent); font: 11px var(--mono); margin-right: 8px; }
.history-item .hi-preview { color: #8b93a7; font: 11px var(--mono); }
```

## 第 8 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：7 处是否完成、检查结果。不要写别的。
