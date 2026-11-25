/* Player: runs code on the local backend, loads the JSONL trace, steps through it. */

(() => {
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

  let dialogOnOk = null;

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

  function diagText(diags) {
    return (diags || []).map((d) => {
      const where = d.line > 0 ? `第 ${d.line} 行${d.col > 0 ? ` 第 ${d.col} 列` : ''}：` : '';
      const kind = d.severity === 'error' ? '错误' : d.severity === 'warning' ? '警告' : '提示';
      return `[${kind}] ${where}${d.message}`;
    }).join('\n');
  }

  async function run() {
    stashStdin();
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
      case 'engine_error':
        showBanner(`追踪引擎出错：${result.msg || '未知原因'}`);
        return;
      default:
        break;
    }

    await loadTrace(result.traceId);

    if (result.outcome === 'runtime_timeout') {
      showBanner('运行超时：程序在限定时间内没有结束（通常意味着死循环）。已保留最后的执行记录。'
        + deepRecursionNote(), true);
    } else if (result.outcome === 'crash') {
      showBanner(`程序异常终止（退出码 ${result.exitCode}），例如数组越界或空指针访问。`
        + deepRecursionNote(), true);
    } else if (result.truncated) {
      showBanner('程序执行超过步数上限，记录已截断。已定位到最后 200 步，可按 10× 回放。', true);
    }

    el.programOutput.textContent = result.programOutput || '';
    state.programOutput = result.programOutput || '';
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
    Memory.renderHeapPanel(el.heap, step, prev);
    CallTree.render(el.calltree, state.steps, clamped);
    el.counter.textContent = counterText(clamped);
    el.scrub.value = String(clamped);
    const atEnd = clamped === state.steps.length - 1;
    el.programOutput.textContent = atEnd ? (state.programOutput || '') : '（程序运行结束后显示）';
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

    CppEditor.init();
    CppEditor.setValue(SAMPLES.basic);
    bind();

    // Deep link for demos/screenshots: #sample=vector&run=42
    const hash = new URLSearchParams(location.hash.slice(1));
    const sample = hash.get('sample');
    if (sample && SAMPLES[sample]) {
      CppEditor.setValue(SAMPLES[sample]);
      el.samples.value = sample;
    }
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
