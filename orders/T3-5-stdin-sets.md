【T-3.5】stdin 多组测试数据（改 3 个文件：index.html、app.js、style.css）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这三个文件的指定片段；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/app.js` 与 `./build.sh`。

## 目标（对齐 M3 原验收：「切换数据集重跑」）
stdin 面板上方加一条切换条：`<select>` 列出「测试数据 1..N」+「＋ 新建」+「删除」。
每组内容独立，存 localStorage（key `cppviz.stdinSets`），切换/刷新都不丢；运行前自动暂存当前内容。

## 第 1 次调用：read 四段
- `index.html` 第 44–50 行（`<details class="io">`）
- `style.css` 第 228–248 行（`.io` / `.io textarea`）
- `app.js` 第 70–78 行（`const el = {};` 附近）、`async function run() {` 前 8 行
- `app.js` 里 `el.clearRuns.addEventListener` 那段、以及 init() 里 `el.dialogCancel = $('dialogCancel');` 附近

## 第 2 次调用：edit #1 —— index.html 加切换条
原文：
```
    <details class="io">
      <summary>测试数据（stdin）</summary>
      <textarea id="stdin" spellcheck="false" placeholder="程序从标准输入读取的数据，例如：&#10;5&#10;1 2 3 4 5"></textarea>
    </details>
```
改为：
```
    <details class="io">
      <summary>测试数据（stdin）</summary>
      <div class="stdin-bar">
        <select id="stdinSet" title="切换测试数据集"></select>
        <button id="stdinAdd" class="ghost" title="新建一组测试数据">＋ 新建</button>
        <button id="stdinDel" class="ghost" title="删除当前这组数据">删除</button>
      </div>
      <textarea id="stdin" spellcheck="false" placeholder="程序从标准输入读取的数据，例如：&#10;5&#10;1 2 3 4 5"></textarea>
    </details>
```

## 第 3 次调用：edit #2 —— style.css 在 `.io textarea { ... }` 规则之后加
```
.io .stdin-bar { display: flex; gap: 8px; align-items: center; padding: 8px 14px 0; }
.io .stdin-bar select { flex: 0 0 140px; }
.io .stdin-bar button { padding: 3px 10px; font-size: 12px; }
.io .stdin-bar button:disabled { opacity: .45; cursor: not-allowed; }
```

## 第 4 次调用：edit #3 —— app.js：状态与函数（插在 `const el = {};` 那一行之后）
```
  const STDIN_KEY = 'cppviz.stdinSets';
  let stdinList = [{ text: '' }];
  let stdinIdx = 0;
  let stdinTimer = 0;

  function readStdinSets() {
    try {
      const raw = localStorage.getItem(STDIN_KEY);
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list) && list.length && list.every((s) => s && typeof s.text === 'string')) {
        return list;
      }
    } catch (ignored) {
      // corrupt or unavailable storage: start fresh
    }
    return [{ text: '' }];
  }

  function saveStdinSets() {
    try {
      localStorage.setItem(STDIN_KEY, JSON.stringify(stdinList));
    } catch (ignored) {
      // private mode: keep working in memory
    }
  }

  function renderStdinBar() {
    el.stdinSet.innerHTML = stdinList.map((_, i) => `<option value="${i}">测试数据 ${i + 1}</option>`).join('');
    el.stdinSet.value = String(stdinIdx);
    el.stdinDel.disabled = stdinList.length <= 1;
  }

  function loadStdinSet(index) {
    stdinIdx = Math.max(0, Math.min(stdinList.length - 1, index));
    el.stdin.value = stdinList[stdinIdx].text || '';
    renderStdinBar();
  }

  function stashStdin() {
    stdinList[stdinIdx] = { text: el.stdin.value };
    saveStdinSets();
  }

  function initStdinSets() {
    stdinList = readStdinSets();
    loadStdinSet(0);
  }
```

## 第 5 次调用：edit #4 —— app.js：run() 开头暂存当前数据
原文：
```
  async function run() {
    stop();
    hideBanner();
```
改为：
```
  async function run() {
    stashStdin();
    stop();
    hideBanner();
```

## 第 6 次调用：edit #5 —— app.js：bind() 里挂事件（`el.clearRuns` 那段之后）
在
```
    el.clearRuns.addEventListener('click', () => {
      showDialog('清空历史记录',
        '将删除 ~/.cppviz/runs 下的所有历史 trace，无法恢复。确定继续？', clearRuns);
    });
```
之后插入：
```

    el.stdinSet.addEventListener('change', () => {
      stashStdin();
      loadStdinSet(Number(el.stdinSet.value));
    });
    el.stdin.addEventListener('input', () => {
      if (stdinTimer) clearTimeout(stdinTimer);
      stdinTimer = setTimeout(stashStdin, 250);
    });
    el.stdinAdd.addEventListener('click', () => {
      stashStdin();
      stdinList.push({ text: '' });
      loadStdinSet(stdinList.length - 1);
      el.stdin.focus();
    });
    el.stdinDel.addEventListener('click', () => {
      if (stdinList.length <= 1) return;
      stdinList.splice(stdinIdx, 1);
      loadStdinSet(Math.min(stdinIdx, stdinList.length - 1));
    });
```

## 第 7 次调用：edit #6 —— app.js：init() 补元素引用与初始化
- `    el.stdin = $('stdin');` 之后加三行：
```
    el.stdinSet = $('stdinSet');
    el.stdinAdd = $('stdinAdd');
    el.stdinDel = $('stdinDel');
```
- `    el.dialogCancel = $('dialogCancel');` 之后加一行：
```
    initStdinSets();
```

## 第 8 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                      → 期望 build ok
```

## 收工
总结 ≤2 行：6 处是否完成、两条检查结果。不要写别的。
