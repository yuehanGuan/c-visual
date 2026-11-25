【T-11.3】期望输出对比（改 index.html + app.js + style.css，共 9 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 的输入面板/程序输出头、`app.js` 的 handleResult/样例事件/init、`style.css` 末尾；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
✅ `state.programOutput` 在每次运行后保存完整输出；播放视图只在最后一步显示它。

## 目标
输入数据下面加「期望输出（可选）」，运行后在「程序输出」标题右侧显示 `✓ 输出一致`
或 `✗ 第 N 行不一致（少/多 X 行）`；内容存 localStorage；「读入求和」样例自带期望 `6`。

## 第 1 次调用：read 四段
- `index.html` 第 46–52 行（输入 details 结束处）与「程序输出」的 pane-head
- `app.js` 的 `el.programOutput.textContent = result.programOutput || '';` 两行
- `app.js` 的 `el.samples.addEventListener('change', ...)` 与 init 里 `initStdinSets();`

## 第 2 次调用：edit #1 —— index.html：输入面板之后加期望输出
原文：
```
    </details>
  </section>

  <section class="pane vars-pane">
```
改为：
```
    </details>
    <details class="io">
      <summary>期望输出（可选）</summary>
      <textarea id="expect" spellcheck="false" placeholder="粘贴标准答案，运行后自动对比"></textarea>
    </details>
  </section>

  <section class="pane vars-pane">
```

## 第 3 次调用：edit #2 —— index.html：程序输出头加状态位
原文：
```
    <div class="pane-head sub">
      <span>程序输出</span>
    </div>
```
改为：
```
    <div class="pane-head sub">
      <span>程序输出</span>
      <span id="expectStatus" class="hint"></span>
    </div>
```

## 第 4 次调用：edit #3 —— app.js：状态与函数（放在 `async function clearRuns()` 之后）
```
  const EXPECT_KEY = 'cppviz.expect';
  let expectTimer = 0;

  function stashExpect() {
    try {
      localStorage.setItem(EXPECT_KEY, el.expect.value || '');
    } catch (ignored) {
      // private mode: compare still works this session
    }
  }

  /* Compare the run's stdout with the optional expected answer. */
  function checkExpect() {
    if (!el.expect || !el.expectStatus) return;
    const want = (el.expect.value || '').trim();
    if (!want) {
      el.expectStatus.textContent = '';
      el.expectStatus.className = 'hint';
      return;
    }
    const got = (state.programOutput || '').trim();
    if (got === want) {
      el.expectStatus.textContent = '✓ 输出一致';
      el.expectStatus.className = 'hint ok';
      return;
    }
    const gotLines = got === '' ? [] : got.split('\n');
    const wantLines = want.split('\n');
    let i = 0;
    while (i < gotLines.length && i < wantLines.length && gotLines[i] === wantLines[i]) i += 1;
    const tail = gotLines.length < wantLines.length
      ? `（少 ${wantLines.length - gotLines.length} 行）`
      : (gotLines.length > wantLines.length ? `（多 ${gotLines.length - wantLines.length} 行）` : '');
    el.expectStatus.textContent = `✗ 第 ${i + 1} 行不一致${tail}`;
    el.expectStatus.className = 'hint bad';
  }

  function initExpect() {
    try {
      const saved = localStorage.getItem(EXPECT_KEY);
      if (saved) el.expect.value = saved;
    } catch (ignored) {
      // default empty
    }
  }

```

## 第 5 次调用：edit #4 —— app.js：运行结束对比
原文：
```
    el.programOutput.textContent = result.programOutput || '';
    state.programOutput = result.programOutput || '';
```
改为：
```
    el.programOutput.textContent = result.programOutput || '';
    state.programOutput = result.programOutput || '';
    checkExpect();
```

## 第 6 次调用：edit #5 —— app.js：切示例时带默认期望
原文：
```
      CppEditor.setValue(SAMPLES[el.samples.value] || '');
      const preset = SAMPLE_STDIN[el.samples.value];
```
改为：
```
      CppEditor.setValue(SAMPLES[el.samples.value] || '');
      el.expect.value = SAMPLE_EXPECT[el.samples.value] || '';
      stashExpect();
      el.expectStatus.textContent = '';
      const preset = SAMPLE_STDIN[el.samples.value];
```

## 第 7 次调用：edit #6 —— app.js：默认期望表（放在 `const SAMPLE_STDIN` 之后）
```
  const SAMPLE_EXPECT = { sum: '6' };

```

## 第 8 次调用：edit #7 —— app.js：深链也带期望
原文：
```
      const preset = SAMPLE_STDIN[sample];
```
改为：
```
      el.expect.value = SAMPLE_EXPECT[sample] || '';
      stashExpect();
      const preset = SAMPLE_STDIN[sample];
```

## 第 9 次调用：edit #8 —— app.js：bind + init
- 在 `el.stdin.addEventListener('input', ...)` 那段之后加：
```
    el.expect.addEventListener('input', () => {
      if (expectTimer) clearTimeout(expectTimer);
      expectTimer = setTimeout(() => { stashExpect(); checkExpect(); }, 300);
    });
```
- `    el.stdin = $('stdin');` 之后加：
```
    el.expect = $('expect');
    el.expectStatus = $('expectStatus');
```
- `    initStdinSets();` 之后加一行 `    initExpect();`

## 第 10 次调用：edit #9 —— style.css 末尾
```
.hint.ok { color: var(--ok); }
.hint.bad { color: var(--err); }
```

## 第 11 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：9 处是否完成、检查结果。不要写别的。
