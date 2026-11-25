/* Player: runs code on the local backend, loads the JSONL trace, steps through it. */

(() => {
  /* Samples that need stdin ship a preset so the first run is meaningful. */
  const SAMPLE_STDIN = { sum: '3\n1 2 3' };

  const SAMPLE_EXPECT = { sum: '6' };

  const SAMPLES = {
    basic: `#include <cstdio>

int main() {
    int a = 1;
    int b = a + 2;
    for (int i = 0; i < 3; i++) {
        b = b + i;
    }
    printf("%d\\n", b);
    return 0;
}
`,
    vector: `#include <cstdio>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    for (int i = 0; i < 5; i++) {
        v.push_back((i + 1) * 10);
    }
    printf("size=%zu\\n", v.size());
    return 0;
}
`,
    recursion: `#include <cstdio>

int fib(int n) {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int r = fib(4);
    printf("%d\\n", r);
    return 0;
}
`,
    swap: `#include <cstdio>

void swap2(int *p, int *q) {
    int t = *p;
    *p = *q;
    *q = t;
}

int main() {
    int a = 7, b = 9;
    swap2(&a, &b);
    printf("%d %d\\n", a, b);
    return 0;
}
`,
    sum: `#include <cstdio>

int main() {
    int n = 0;
    scanf("%d", &n);
    int sum = 0;
    for (int i = 0; i < n; i++) {
        int x = 0;
        scanf("%d", &x);
        sum += x;
    }
    printf("%d\\n", sum);
    return 0;
}
`,
  };

  const state = {
    steps: [],
    idx: 0,
    segments: [],
    segIdx: 0,
    folded: true,
    playing: false,
    timer: null,
    meta: null,
    programOutput: '',
  };

  const el = {};

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

  function $(id) {
    return document.getElementById(id);
  }

  function buildSegments(steps) {
    const segs = [];
    let i = 0;
    while (i < steps.length) {
      let best = null;
      for (let p = 1; p <= 8; p++) {
        let reps = 1;
        while (i + (reps + 1) * p <= steps.length) {
          let ok = true;
          for (let k = 0; k < p; k++) {
            if (steps[i + reps * p + k].line !== steps[i + k].line) { ok = false; break; }
          }
          if (!ok) break;
          reps++;
        }
        const covered = reps * p;
        if (reps >= 3 && covered >= 6 && (best === null || covered > best.covered)) {
          best = { p, reps, covered };
        }
      }
      if (best) {
        segs.push({ from: i, to: i + best.covered - 1, count: best.covered,
          period: best.p, reps: best.reps, folded: true });
        i += best.covered;
      } else {
        segs.push({ from: i, to: i, count: 1, folded: false });
        i += 1;
      }
    }
    return segs;
  }

  function segAt(idx) {
    for (const seg of state.segments) {
      if (idx >= seg.from && idx <= seg.to) return seg;
    }
    return null;
  }

  function segIndexAt(idx) {
    for (let k = 0; k < state.segments.length; k++) {
      if (idx >= state.segments[k].from && idx <= state.segments[k].to) return k;
    }
    return 0;
  }

  function showBanner(text, warn) {
    el.banner.textContent = text;
    el.banner.classList.toggle('warn', Boolean(warn));
    el.banner.classList.remove('hidden');
  }

  function hideBanner() {
    el.banner.classList.add('hidden');
  }

  const CODE_KEY = 'cppviz.code';
  let codeTimer = 0;

  function stashCode() {
    try {
      localStorage.setItem(CODE_KEY, CppEditor.getValue());
    } catch (ignored) {
      // private mode: code just won't persist
    }
  }

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
    const pythonBroken = envCache.lldb && envCache.lldb.found
      && envCache.python && !envCache.python.found;
    if (pythonBroken) missing.push('lldb 的 Python 支持');
    if (!missing.length) return;
    const mac = /mac/i.test(envCache.os || '');
    el.envText.textContent = '缺少 ' + missing.join(' / ') + '，无法编译或调试 C++。'
      + (pythonBroken
        ? ' 需要 Python 3.10 x64（官方 Windows 版 lldb 要加载 python310.dll），装好后会自动检测。'
        : (mac ? ' 点「帮我安装」调起 Xcode 命令行工具安装。' : ' 点「帮我安装」打开 LLVM 下载页。'));
    el.envBar.classList.remove('hidden');
  }

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


  let dialogOnOk = null;

  const ZOOM_KEY = 'cppviz.zoom';
  const ZOOM_MIN = 100;
  const ZOOM_MAX = 200;
  const ZOOM_STEP = 25;
  let zoom = 100;

  /* Scale the memory SVG's viewport; the viewBox is unchanged, so text and
   * cells scale together and the pane simply scrolls. */
  function applyZoom() {
    const svg = el.frames && el.frames.querySelector('svg.mem');
    if (!svg) return;
    const w = Number(svg.getAttribute('width')) || 0;
    const h = Number(svg.getAttribute('height')) || 0;
    if (!w || !h) return;
    svg.style.width = Math.round(w * zoom / 100) + 'px';
    svg.style.height = Math.round(h * zoom / 100) + 'px';
    if (el.zoomLabel) el.zoomLabel.textContent = zoom + '%';
  }

  function setZoom(next) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch (ignored) {
      // private mode: zoom still works for this session
    }
    applyZoom();
  }

  function initZoom() {
    try {
      const saved = Number(localStorage.getItem(ZOOM_KEY));
      if (Number.isFinite(saved) && saved >= ZOOM_MIN && saved <= ZOOM_MAX) zoom = saved;
    } catch (ignored) {
      // default 100%
    }
    if (el.zoomLabel) el.zoomLabel.textContent = zoom + '%';
  }

  /* Deep recursion often looks like a timeout or a crash: the last recorded
   * step has many identical frames.  Name it instead of blaming a dead loop. */
  function deepRecursionNote() {
    const last = state.steps[state.steps.length - 1];
    const frames = (last && last.frames) || [];
    if (frames.length < 16) return '';
    const fn = frames[0].fn;
    const same = frames.filter((f) => f.fn === fn).length;
    if (same < frames.length * 0.8) return '';
    return ` 栈上至少有 ${frames.length} 层 ${fn}，看起来是递归太深 / 栈溢出。`;
  }

  function showDialog(title, text, onOk) {
    el.dialogTitle.textContent = title;
    el.dialogText.textContent = text;
    dialogOnOk = typeof onOk === 'function' ? onOk : null;
    el.dialogCancel.classList.toggle('hidden', !dialogOnOk);
    el.dialogOk.textContent = dialogOnOk ? '确定' : '知道了';
    el.dialog.classList.remove('hidden');
  }

  const APP_VERSION = 'v1.0.3';
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
      '工具链：' + (envCache
        ? 'clang ' + (envCache.clang && envCache.clang.found ? '✓' : '✗')
          + ' / lldb ' + (envCache.lldb && envCache.lldb.found ? '✓' : '✗')
        : '未知'),
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

  function diagText(diags) {
    return (diags || []).map((d) => {
      const where = d.line > 0 ? `第 ${d.line} 行${d.col > 0 ? ` 第 ${d.col} 列` : ''}：` : '';
      const kind = d.severity === 'error' ? '错误' : d.severity === 'warning' ? '警告' : '提示';
      return `[${kind}] ${where}${d.message}`;
    }).join('\n');
  }

  async function run() {
    stashStdin();
    stashCode();
    stop();
    hideBanner();
    el.runBtn.disabled = true;
    el.runBtn.textContent = '运行中…';
    el.status.textContent = '';
    CppEditor.setErrorLines([]);

    const form = new URLSearchParams();
    form.set('code', CppEditor.getValue());
    form.set('stdin', el.stdin.value);
    form.set('maxSteps', el.maxSteps.value);

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form.toString(),
      });
      const result = await response.json();
      await handleResult(result);
    } catch (error) {
      showBanner(`请求失败：${error}\n（后端是否已启动？）`);
    } finally {
      el.runBtn.disabled = false;
      el.runBtn.textContent = '运行 ▶';
    }
  }

  async function handleResult(result) {
    switch (result.outcome) {
      case 'compile_timeout':
        showDialog('编译超时', '编译超过 10 秒没有完成，请检查代码规模或是否包含异常内容。');
        return;
      case 'compile_error': {
        const lines = (result.diags || []).map((d) => d.line).filter((n) => n > 0);
        CppEditor.setMode('edit');
        CppEditor.setErrorLines(lines);
        showBanner(diagText(result.diags) || '编译失败，但没有解析出具体信息。');
        return;
      }
      case 'engine_error': {
        const message = result.msg || '未知原因';
        if (/Cannot run program/i.test(message) || /No such file/i.test(message)) {
          showBanner('找不到 C++ 工具链（clang++ / lldb）。macOS：xcode-select --install；Windows：安装 LLVM 并加入 PATH。');
        } else {
          showBanner(`追踪引擎出错：${message}`);
        }
        return;
      }
      default:
        break;
    }

    await loadTrace(result.traceId);

    if (result.outcome === 'runtime_timeout') {
      showBanner('运行超时：程序在限定时间内没有结束（通常意味着死循环）。已保留最后的执行记录。'
        + deepRecursionNote(), true);
    } else if (result.outcome === 'crash') {
      const crashLine = (state.steps[state.steps.length - 1] || {}).line;
      if (crashLine) CppEditor.setErrorLines([crashLine]);
      showBanner(`程序异常终止（退出码 ${result.exitCode}）`
        + (crashLine ? `：崩溃发生在第 ${crashLine} 行附近（已标红）`
                     : '，例如数组越界或空指针访问')
        + '。' + deepRecursionNote(), true);
    } else if (result.truncated) {
      showBanner('程序执行超过步数上限，记录已截断。已定位到最后 200 步，可按 10× 回放。', true);
    }

    el.programOutput.textContent = result.programOutput || '';
    state.programOutput = result.programOutput || '';
    checkExpect();
    if (el.historyBox && el.historyBox.open) loadHistory();
    el.engineTag.textContent = state.meta && state.meta.engine ? state.meta.engine : '';
    el.status.textContent = result.outcome === 'ok' ? '就绪' : '';
    CppEditor.setMode('play');
    el.editBtn.classList.remove('hidden');
    /* A truncated run means the step budget ran out: land on the tail where
     * the repeating pattern is visible, and replay at 10x (45ms per step). */
    if (result.truncated && state.steps.length > 200) {
      el.speed.value = '45';
      goTo(state.steps.length - 200);
    } else {
      goTo(0);
    }
  }

  async function loadTrace(traceId) {
    state.traceId = traceId;
    const response = await fetch(`/api/trace/${traceId}`);
    const text = await response.text();
    const steps = [];
    let meta = null;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        continue;
      }
      if (record.t === 'step') steps.push(record);
      else if (record.t === 'meta') meta = record;
    }
    state.steps = steps;
    state.meta = meta;
    state.idx = 0;
    state.segments = buildSegments(steps);
    state.segIdx = 0;
    el.scrub.max = String(Math.max(0, steps.length - 1));
    el.scrub.value = '0';
    el.counter.textContent = counterText(0);
    if (steps.length === 0) {
      el.frames.innerHTML = '<p class="empty">没有产生任何执行步骤</p>';
      el.heap.innerHTML = '<p class="empty">（当前没有堆数据）</p>';
      el.calltree.innerHTML = '';
      showBanner('这次运行没有记录到任何执行的代码行，程序可能一开始就结束了。', true);
    }
  }

  /* Trace stdout is a growing byte count; show only what has been printed. */
  function outputText(bytes) {
    const full = state.programOutput || '';
    if (typeof bytes !== 'number' || bytes < 0) return full;
    if (bytes === 0) return '';
    try {
      const encoded = new TextEncoder().encode(full);
      return new TextDecoder().decode(encoded.slice(0, bytes));
    } catch (ignored) {
      return full.slice(0, bytes);
    }
  }

  function goTo(index) {
    if (state.steps.length === 0) return;
    const clamped = Math.max(0, Math.min(state.steps.length - 1, index));
    state.idx = clamped;
    state.segIdx = segIndexAt(clamped);
    const step = state.steps[clamped];
    const prev = clamped > 0 ? state.steps[clamped - 1] : null;

    CppEditor.highlight(step.line);
    el.frames.innerHTML = Vars.renderFrames(step.frames, prev ? prev.frames : null);
    Memory.render(el.frames, step, prev);
    applyZoom();
    Memory.renderHeapPanel(el.heap, step, prev);
    CallTree.render(el.calltree, state.steps, clamped);
    el.counter.textContent = counterText(clamped);
    el.scrub.value = String(clamped);
    const atEnd = clamped === state.steps.length - 1;
    if (atEnd) {
      el.programOutput.textContent = state.programOutput || '';
    } else if (step && step.out !== undefined) {
      el.programOutput.textContent = outputText(step.out);
    } else {
      el.programOutput.textContent = '（程序运行结束后显示）';
    }
  }

  function counterText(idx) {
    const total = state.steps.length;
    const seg = state.folded ? segAt(idx) : null;
    if (seg && seg.folded) {
      const line = state.steps[idx].line;
      const n = idx - seg.from + 1;
      return `循环 第 ${line} 行 × ${seg.reps} 次（本步 ${n}/${seg.count}）`;
    }
    return `第 ${idx + 1} / ${total} 步`;
  }

  function next() {
    if (state.idx >= state.steps.length - 1) {
      stop();
      return;
    }
    if (!state.folded) { goTo(state.idx + 1); return; }
    const seg = segAt(state.idx);
    if (seg && seg.folded && state.idx === seg.to) {
      const k = segIndexAt(state.idx);
      const nextSeg = state.segments[k + 1];
      goTo(nextSeg ? nextSeg.from : state.idx + 1);
      return;
    }
    goTo(state.idx + 1);
  }

  function prev() {
    if (!state.folded) { goTo(state.idx - 1); return; }
    const seg = segAt(state.idx);
    if (seg && seg.folded && state.idx === seg.from) {
      const k = segIndexAt(state.idx);
      const prevSeg = state.segments[k - 1];
      goTo(prevSeg ? prevSeg.to : state.idx - 1);
      return;
    }
    goTo(state.idx - 1);
  }

  function tick() {
    if (!state.playing) return;
    if (state.idx >= state.steps.length - 1) {
      stop();
      return;
    }
    next();
    state.timer = setTimeout(tick, Number(el.speed.value));
  }

  function play() {
    if (state.steps.length === 0) return;
    if (state.idx >= state.steps.length - 1) goTo(0);
    state.playing = true;
    el.playBtn.textContent = '暂停';
    tick();
  }

  function stop() {
    state.playing = false;
    el.playBtn.textContent = '播放';
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function bind() {
    el.runBtn.addEventListener('click', run);
    el.prevBtn.addEventListener('click', () => {
      stop();
      prev();
    });
    el.nextBtn.addEventListener('click', () => {
      stop();
      next();
    });
    el.playBtn.addEventListener('click', () => (state.playing ? stop() : play()));
    el.scrub.addEventListener('input', () => {
      stop();
      goTo(Number(el.scrub.value));
    });
    el.samples.addEventListener('change', () => {
      stop();
      CppEditor.setMode('edit');
      CppEditor.setValue(SAMPLES[el.samples.value] || '');
      el.expect.value = SAMPLE_EXPECT[el.samples.value] || '';
      stashExpect();
      el.expectStatus.textContent = '';
      const preset = SAMPLE_STDIN[el.samples.value];
      if (preset !== undefined) {
        el.stdin.value = preset;
        stashStdin();
      }
      el.editBtn.classList.add('hidden');
      hideBanner();
      el.frames.innerHTML = '<p class="empty">点右上角「运行 ▶」开始</p>';
      el.heap.innerHTML = '<p class="empty">（当前没有堆数据）</p>';
      el.calltree.innerHTML = '';
    });
    el.editBtn.addEventListener('click', () => {
      stop();
      CppEditor.setMode('edit');
      el.editBtn.classList.add('hidden');
      el.status.textContent = '';
    });
    el.foldBtn.addEventListener('click', () => {
      state.folded = !state.folded;
      el.foldBtn.textContent = state.folded ? '折叠：开' : '折叠：关';
      if (state.steps.length) goTo(state.idx);
    });

    el.zoomOut.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
    el.zoomIn.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));

    el.exportTrace.addEventListener('click', exportTrace);
    el.bugBtn.addEventListener('click', openBugDialog);
    el.envFix.addEventListener('click', fixEnv);
    el.envHide.addEventListener('click', () => el.envBar.classList.add('hidden'));
    el.bugClose.addEventListener('click', closeBugDialog);
    el.bugCopy.addEventListener('click', copyBugReport);
    el.bugMail.addEventListener('click', mailBugReport);
    el.bugDialog.addEventListener('click', (event) => {
      if (event.target === el.bugDialog) closeBugDialog();
    });
    el.source.addEventListener('input', () => {
      if (codeTimer) clearTimeout(codeTimer);
      codeTimer = setTimeout(stashCode, 500);
    });

    el.clearRuns.addEventListener('click', () => {
      showDialog('清空历史记录',
        '将删除 ~/.cppviz/runs 下的所有历史 trace，无法恢复。确定继续？', clearRuns);
    });

    el.stdinSet.addEventListener('change', () => {
      stashStdin();
      loadStdinSet(Number(el.stdinSet.value));
    });
    el.stdin.addEventListener('input', () => {
      if (stdinTimer) clearTimeout(stdinTimer);
      stdinTimer = setTimeout(stashStdin, 250);
    });
    el.expect.addEventListener('input', () => {
      if (expectTimer) clearTimeout(expectTimer);
      expectTimer = setTimeout(() => { stashExpect(); checkExpect(); }, 300);
    });
    el.historyBox.addEventListener('toggle', () => {
      if (el.historyBox.open) loadHistory();
    });
    el.history.addEventListener('click', (event) => {
      const button = event.target.closest('.history-item');
      if (button) openRun(button.dataset.id);
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

    document.addEventListener('keydown', (event) => {
      const typing = document.activeElement &&
        (document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.tagName === 'INPUT');
      if (typing) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stop();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stop();
        prev();
      } else if (event.key === ' ') {
        event.preventDefault();
        state.playing ? stop() : play();
      }
    });
  }

  function init() {
    el.banner = $('banner');
    el.frames = $('frames');
    el.zoomIn = $('zoomIn');
    el.zoomOut = $('zoomOut');
    el.zoomLabel = $('zoomLabel');
    el.heap = $('heap');
    el.calltree = $('calltree');
    el.programOutput = $('programOutput');
    el.counter = $('counter');
    el.scrub = $('scrub');
    el.speed = $('speed');
    el.status = $('status');
    el.engineTag = $('engineTag');
    el.runBtn = $('runBtn');
    el.prevBtn = $('prevBtn');
    el.nextBtn = $('nextBtn');
    el.playBtn = $('playBtn');
    el.samples = $('samples');
    el.maxSteps = $('maxSteps');
    el.stdin = $('stdin');
    el.source = $('source');
    el.exportTrace = $('exportTrace');
    el.bugBtn = $('bugBtn');
    el.envBar = $('envBar');
    el.envText = $('envText');
    el.envFix = $('envFix');
    el.envHide = $('envHide');
    el.bugDialog = $('bugDialog');
    el.bugReport = $('bugReport');
    el.bugCopy = $('bugCopy');
    el.bugMail = $('bugMail');
    el.bugClose = $('bugClose');
    el.expect = $('expect');
    el.history = $('history');
    el.historyBox = $('historyBox');
    el.expectStatus = $('expectStatus');
    el.stdinSet = $('stdinSet');
    el.stdinAdd = $('stdinAdd');
    el.stdinDel = $('stdinDel');
    el.editBtn = $('editBtn');
    el.foldBtn = $('foldBtn');
    el.clearRuns = $('clearRuns');
    el.dialog = $('dialog');
    el.dialogTitle = $('dialogTitle');
    el.dialogText = $('dialogText');
    el.dialogOk = $('dialogOk');
    el.dialogCancel = $('dialogCancel');
    initStdinSets();
    initExpect();
    initZoom();

    CppEditor.init();
    let initialCode = SAMPLES.basic;
    try {
      const saved = localStorage.getItem(CODE_KEY);
      if (saved) initialCode = saved;
    } catch (ignored) {
      // default sample
    }
    CppEditor.setValue(initialCode);
    bind();

    // Deep link for demos/screenshots: #sample=vector&run=42
    const hash = new URLSearchParams(location.hash.slice(1));
    const sample = hash.get('sample');
    if (sample && SAMPLES[sample]) {
      CppEditor.setValue(SAMPLES[sample]);
      el.samples.value = sample;
      el.expect.value = SAMPLE_EXPECT[sample] || '';
      stashExpect();
      const preset = SAMPLE_STDIN[sample];
      if (preset !== undefined) {
        el.stdin.value = preset;
        stashStdin();
      }
    }
    checkEnv();
    if (hash.has('run')) {
      const at = hash.get('run');
      setTimeout(async () => {
        await run();
        if (at) goTo(Number(at));
      }, 80);
    }
  }

  // 测试钩子：供无头浏览器/CDP 读取步骤数与折叠段
  window.__viz = { state, buildSegments, loadTrace };

  document.addEventListener('DOMContentLoaded', init);
})();
