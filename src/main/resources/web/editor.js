/* Code pane: an editable textarea, and a highlighted read-only view for playback.
 *
 * Two modes instead of an overlay: during playback you are reading, not editing,
 * and a plain <div> per line makes highlighting trivial. */

const CppEditor = (() => {
  const els = {};
  let mode = 'edit';
  let errorLines = new Set();

  const TYPES = new Set(['int', 'char', 'double', 'float', 'long', 'short', 'bool', 'void',
    'unsigned', 'signed', 'size_t', 'auto', 'string', 'vector', 'map', 'set', 'queue',
    'stack', 'pair', 'struct', 'class', 'const', 'static', 'true', 'false', 'nullptr']);

  const KEYWORDS = new Set(['return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue',
    'using', 'namespace', 'include', 'new', 'delete', 'sizeof', 'switch', 'case', 'default',
    'goto', 'template', 'typename', 'public', 'private', 'protected', 'this', 'cout', 'cin',
    'endl', 'printf', 'scanf', 'push_back', 'size', 'begin', 'end', 'first', 'second']);

  const TOKEN = /(\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(^[ \t]*#[a-zA-Z]+)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightLine(text) {
    let out = '';
    let last = 0;
    let match;
    TOKEN.lastIndex = 0;
    while ((match = TOKEN.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, match.index));
      const [raw, comment, str, pre, num, word] = match;
      let cls = null;
      if (comment) cls = 'tok-com';
      else if (str) cls = 'tok-str';
      else if (pre) cls = 'tok-pre';
      else if (num) cls = 'tok-num';
      else if (word) {
        const after = text.slice(match.index + word.length).match(/^\s*\(/);
        if (TYPES.has(word)) cls = 'tok-type';
        else if (KEYWORDS.has(word)) cls = 'tok-kw';
        else if (after) cls = 'tok-fn';
      }
      out += cls ? `<span class="${cls}">${escapeHtml(raw)}</span>` : escapeHtml(raw);
      last = match.index + raw.length;
      if (raw.length === 0) TOKEN.lastIndex++;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function syncGutter(lineCount, force) {
    if (!force && els.gutter.childElementCount === lineCount) return;
    const html = [];
    for (let i = 1; i <= lineCount; i++) {
      html.push(`<span data-n="${i}" class="${errorLines.has(i) ? 'err' : ''}">${i}</span>`);
    }
    els.gutter.innerHTML = html.join('');
  }

  function refreshEdit(force) {
    const lines = els.source.value.split('\n');
    syncGutter(lines.length, force);
    els.gutter.scrollTop = els.source.scrollTop;
  }

  function renderPlayView(text) {
    const lines = text.split('\n');
    els.codeView.innerHTML = lines.map((line, i) => {
      const n = i + 1;
      const trimmed = line.trim();
      // A bare brace is a real executed line (loop increment / scope exit) but
      // reads as mysterious, so say what it means instead of hiding it.
      const structural = trimmed.length > 0 && /^[{}]+$/.test(trimmed);
      const hint = structural
        ? '<span class="brace-hint">作用域结束 / 循环迭代</span>'
        : '';
      return `<div class="line${errorLines.has(n) ? ' errline' : ''}" data-line="${n}">` +
        `<span class="ln">${n}</span><span class="src">${highlightLine(line) || ' '}${hint}</span></div>`;
    }).join('');
  }

  function setMode(next) {
    mode = next;
    const playing = next === 'play';
    els.source.classList.toggle('hidden', playing);
    els.gutter.classList.toggle('hidden', playing);
    els.codeView.classList.toggle('hidden', !playing);
    if (playing) renderPlayView(els.source.value);
    else refreshEdit();
  }

  function highlight(line) {
    const prev = els.codeView.querySelector('.line.active');
    if (prev) prev.classList.remove('active');
    if (!line) return;
    const el = els.codeView.querySelector(`.line[data-line="${line}"]`);
    if (!el) return;
    el.classList.add('active');
    const box = els.codeView;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    if (Math.abs(box.scrollTop - top) > 4) box.scrollTop = Math.max(0, top);
  }

  function setErrorLines(lines) {
    errorLines = new Set(lines);
    // Force a rebuild: the line count rarely changes, but the error markers do.
    refreshEdit(true);
    renderPlayView(els.source.value);
  }

  function init() {
    els.source = document.getElementById('source');
    els.gutter = document.getElementById('gutter');
    els.codeView = document.getElementById('codeView');
    els.source.addEventListener('input', refreshEdit);
    els.source.addEventListener('scroll', () => {
      els.gutter.scrollTop = els.source.scrollTop;
    });
    els.source.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = els.source.selectionStart;
        els.source.setRangeText('    ', start, els.source.selectionEnd, 'end');
        refreshEdit();
      }
    });
    refreshEdit();
  }

  return {
    init,
    setMode,
    highlight,
    setErrorLines,
    getValue: () => els.source.value,
    setValue: (text) => {
      els.source.value = text;
      errorLines = new Set();
      refreshEdit();
      renderPlayView(text);
    },
    getMode: () => mode,
  };
})();
