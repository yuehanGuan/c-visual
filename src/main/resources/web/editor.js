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

  /* Strip // comments and string/char literals so braces inside them do not
   * count; `state.inBlock` carries an open block comment across lines. */
  function codeOnly(line, state) {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (state.inBlock) {
        const end = line.indexOf('*/', i);
        if (end < 0) return out;
        i = end + 2;
        state.inBlock = false;
        continue;
      }
      if (line.startsWith('//', i)) break;
      if (line.startsWith('/*', i)) {
        state.inBlock = true;
        i += 2;
        continue;
      }
      const ch = line[i];
      if (ch === '"' || ch === "'") {
        i += 1;
        while (i < line.length) {
          if (line[i] === '\\') { i += 2; continue; }
          if (line[i] === ch) { i += 1; break; }
          i += 1;
        }
        out += ' ';
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  /* Which construct owns the block opened at this brace? */
  function blockOwner(prefix, previous) {
    let text = (prefix || '').replace(/^[}\s]+/, '').trim();
    if (!text) text = (previous || '').trim();
    let m = text.match(/^(else\s+)?if\b/);
    if (m) return { label: m[1] ? 'else if 分支' : 'if 分支' };
    if (/^else\b/.test(text)) return { label: 'else 分支' };
    if (/^do\b/.test(text)) return { label: 'do-while 循环' };
    m = text.match(/^(for|while)\b/);
    if (m) return { label: m[1] + ' 循环' };
    if (/^switch\b/.test(text)) return { label: 'switch' };
    m = text.match(/^(struct|class)\s+([A-Za-z_]\w*)/);
    if (m) return { label: m[1] + ' ' + m[2] };
    if (/^namespace\b/.test(text)) return { label: '命名空间' };
    m = text.match(/([A-Za-z_]\w*)\s*\([^()]*\)\s*(?:const\s*)?$/);
    if (m) return { label: '函数 ' + m[1] };
    return { label: '作用域' };
  }

  /* Map each bare closing-brace line to the line that opened its block:
   *   { 4: '← for 循环（第 2 行）', 5: '← 函数 main（第 1 行）' } */
  function describeBraces(lines) {
    const hints = {};
    const stack = [];
    const state = { inBlock: false };
    let previous = '';
    let previousNo = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const n = i + 1;
      const code = codeOnly(lines[i], state);
      const trimmed = code.trim();
      const bareClose = /^[}]+;?$/.test(trimmed);
      for (let j = 0; j < code.length; j += 1) {
        if (code[j] === '{') {
          const prefix = code.slice(0, j);
          // A `{` on its own line belongs to the signature above it.
          const ownLine = prefix.replace(/^[}\s]+/, '').trim() ? n : (previousNo || n);
          stack.push({ line: ownLine, label: blockOwner(prefix, previous).label });
        } else if (code[j] === '}') {
          const owner = stack.pop();
          if (owner && bareClose) hints[n] = `← ${owner.label}（第 ${owner.line} 行）`;
        }
      }
      if (trimmed) {
        previous = code;
        previousNo = n;
      }
    }
    return hints;
  }

  function renderPlayView(text) {
    const lines = text.split('\n');
    const hints = describeBraces(lines);
    els.codeView.innerHTML = lines.map((line, i) => {
      const n = i + 1;
      const trimmed = line.trim();
      // A bare closing brace is a real executed line (loop increment / scope
      // exit); name the block it closes instead of leaving it mysterious.
      const structural = /^[}]+;?$/.test(trimmed);
      const hint = structural
        ? `<span class="brace-hint">${hints[n] || '作用域结束 / 循环迭代'}</span>`
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
    describeBraces,
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
