【T-3.4b】「清空历史」按钮 + 二次确认（改 3 个文件：index.html、app.js、style.css）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这三个文件的指定片段；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/app.js` 与 `./build.sh`。
✅ 后端 `POST /api/runs/clear` 已实现并实测（返回 `{"cleared":N}`，清空后 `/api/trace/<旧 id>` 为 404）。

## 目标
工具条加「清空历史」按钮；点击弹二次确认（复用现有 dialog，增加「取消」）；
确认后调 `POST /api/runs/clear`，并在底部状态栏显示「已清空 N 份历史」。

## 第 1 次调用：read 四段
- `index.html` 第 16–26 行（工具条）与 89–95 行（dialog）
- `app.js` 第 136–141 行（`showDialog`）、第 362–372 行（dialog 绑定）、第 410–417 行（init 里的 el 赋值）
- `style.css` 第 383–392 行（`.dialog-box`）

## 第 2 次调用：edit #1 —— index.html 工具条加按钮
原文：
```
    <button id="foldBtn" class="ghost">折叠：开</button>
    <button id="runBtn" class="primary">运行 ▶</button>
```
改为：
```
    <button id="foldBtn" class="ghost">折叠：开</button>
    <button id="clearRuns" class="ghost" title="删除 ~/.cppviz/runs 下的历史记录">清空历史</button>
    <button id="runBtn" class="primary">运行 ▶</button>
```

## 第 3 次调用：edit #2 —— index.html dialog 加取消按钮
原文：
```
    <p id="dialogText"></p>
    <button id="dialogOk" class="primary">知道了</button>
```
改为：
```
    <p id="dialogText"></p>
    <div class="dialog-actions">
      <button id="dialogCancel" class="ghost hidden">取消</button>
      <button id="dialogOk" class="primary">知道了</button>
    </div>
```

## 第 4 次调用：edit #3 —— style.css 在 `.dialog-box button { width: 100%; }` 之后加
```
.dialog-actions { display: flex; gap: 8px; }
.dialog-actions button { flex: 1; }
```

## 第 5 次调用：edit #4 —— app.js：`showDialog` 支持确认回调 + 清空函数
原文：
```
  function showDialog(title, text) {
    el.dialogTitle.textContent = title;
    el.dialogText.textContent = text;
    el.dialog.classList.remove('hidden');
  }
```
改为：
```
  let dialogOnOk = null;

  function showDialog(title, text, onOk) {
    el.dialogTitle.textContent = title;
    el.dialogText.textContent = text;
    dialogOnOk = typeof onOk === 'function' ? onOk : null;
    el.dialogCancel.classList.toggle('hidden', !dialogOnOk);
    el.dialogOk.textContent = dialogOnOk ? '确定' : '知道了';
    el.dialog.classList.remove('hidden');
  }

  /** Delete every stored run after the user confirms in the dialog. */
  async function clearRuns() {
    try {
      const response = await fetch('/api/runs/clear', { method: 'POST' });
      const data = await response.json();
      el.status.textContent = `已清空 ${data.cleared} 份历史`;
    } catch (failure) {
      el.status.textContent = '清空失败：' + failure;
    }
  }
```

## 第 6 次调用：edit #5 —— app.js：dialog 点击逻辑（约第 369–372 行）
原文：
```
    el.dialogOk.addEventListener('click', () => el.dialog.classList.add('hidden'));
    el.dialog.addEventListener('click', (event) => {
      if (event.target === el.dialog) el.dialog.classList.add('hidden');
    });
```
改为：
```
    el.dialogOk.addEventListener('click', () => {
      const action = dialogOnOk;
      el.dialog.classList.add('hidden');
      dialogOnOk = null;
      if (action) action();
    });
    el.dialogCancel.addEventListener('click', () => {
      el.dialog.classList.add('hidden');
      dialogOnOk = null;
    });
    el.dialog.addEventListener('click', (event) => {
      if (event.target === el.dialog) {
        el.dialog.classList.add('hidden');
        dialogOnOk = null;
      }
    });
```

## 第 7 次调用：edit #6 —— app.js：bind 里挂「清空历史」（`foldBtn` 的绑定之后）
在
```
    el.foldBtn.addEventListener('click', () => {
      state.folded = !state.folded;
      el.foldBtn.textContent = state.folded ? '折叠：开' : '折叠：关';
      if (state.steps.length) goTo(state.idx);
    });
```
之后插入：
```

    el.clearRuns.addEventListener('click', () => {
      showDialog('清空历史记录',
        '将删除 ~/.cppviz/runs 下的所有历史 trace，无法恢复。确定继续？', clearRuns);
    });
```

## 第 8 次调用：edit #7 —— app.js：init 里的元素引用
- `    el.foldBtn = $('foldBtn');` → 下一行加 `    el.clearRuns = $('clearRuns');`
- `    el.dialogOk = $('dialogOk');` → 下一行加 `    el.dialogCancel = $('dialogCancel');`

## 第 9 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                      → 期望 build ok
```

## 收工
总结 ≤2 行：7 处是否完成、两条检查结果。不要写别的。
