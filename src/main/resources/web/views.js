/* Render the trace view-model (see docs/TRACE_SCHEMA.md) into DOM.
 *
 * Kinds: scalar | seq | grid | text | opaque.
 * Values arrive as strings, because that is what the debugger can promise.
 * Unknown kinds fall back to `opaque` and never throw. */

const Vars = (() => {
  const MAX_GHOST = 24;

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function signature(node) {
    if (!node) return '';
    if (node.kind === 'scalar') return `${node.type}=${node.value}`;
    if (node.kind === 'seq') return `${node.type}[${(node.items || []).join(',')}]`;
    return `${node.kind}:${node.type}`;
  }

  function isUninit(text) {
    return /^-?\d{6,}$/.test(String(text)) || text === '<unavailable>';
  }

  function cell(value, index, changed) {
    const idx = index === undefined ? '' : `<span class="idx">${index}</span>`;
    return `<div class="cell${changed ? ' changed' : ''}">${idx}${escapeHtml(value)}</div>`;
  }

  function renderSeq(node, prev) {
    const items = node.items || [];
    const prevItems = (prev && prev.items) || [];
    const cells = items.map((value, i) => cell(value, i, prevItems[i] !== value));

    const size = node.size ?? items.length;
    const capacity = node.capacity;
    let ghostCount = 0;
    if (typeof capacity === 'number' && capacity > size) {
      ghostCount = Math.min(capacity - size, MAX_GHOST);
      for (let i = 0; i < ghostCount; i++) {
        cells.push('<div class="cell ghost"></div>');
      }
    }

    let meta = `<span class="sz">size ${size}</span>`;
    if (typeof capacity === 'number') {
      meta += ` · <span class="cap">capacity ${capacity}</span>`;
    }
    if (typeof capacity === 'number' && capacity - size > MAX_GHOST) {
      cells.push(`<div class="cell more">+${capacity - size - MAX_GHOST} 空位</div>`);
    }

    return `<div class="cells">${cells.join('')}</div><div class="seq-meta">${meta}</div>`;
  }

  function renderGrid(node, prev) {
    const rows = node.rows || [];
    const prevRows = (prev && prev.rows) || [];
    const body = rows.map((row, r) => {
      const cells = row.map((value, c) => {
        const before = (prevRows[r] || [])[c];
        return `<td class="${before !== value ? 'changed' : ''}">${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr><th>${r}</th>${cells}</tr>`;
    }).join('');
    return `<table class="grid-table">${body}</table>`;
  }

  function renderScalar(node, prev) {
    const changed = prev && prev.value !== node.value;
    const uninit = isUninit(node.value);
    return `<span class="scalar-value${uninit ? ' uninit' : ''}${changed ? ' changed' : ''}">` +
      `${escapeHtml(node.value)}</span>` +
      (uninit ? '<span class="seq-meta">未初始化（栈上的随机值）</span>' : '');
  }

  function renderVar(node, prev) {
    const prevNode = prev ? prev[node.name] : undefined;
    const changed = prevNode && signature(prevNode) !== signature(node);
    const head =
      `<div class="var-head"><span class="var-name">${escapeHtml(node.name)}</span>` +
      (node.type ? `<span class="var-type">${escapeHtml(node.type)}</span>` : '') + '</div>';

    let body;
    switch (node.kind) {
      case 'seq':
        body = renderSeq(node, prevNode);
        break;
      case 'grid':
        body = renderGrid(node, prevNode);
        break;
      case 'text':
        body = `<span class="text-value">"${escapeHtml(node.value || '')}"</span>`;
        break;
      case 'scalar':
        body = renderScalar(node, prevNode);
        break;
      default:
        body = `<span class="opaque-value">${escapeHtml(node.type || '')} ` +
          `${escapeHtml(node.value ?? '')}</span>`;
    }
    return `<div class="var${changed ? ' changed' : ''}">${head}${body}</div>`;
  }

  function toMap(vars) {
    const map = {};
    for (const node of vars || []) {
      map[node.name] = node;
    }
    return map;
  }

  /** Render a step's frames. `prev` is the previous step's frames array. */
  function renderFrames(frames, prevFrames) {
    if (!frames || frames.length === 0) {
      return '<p class="empty">这一行还没有进入任何函数</p>';
    }
    return frames.map((frame, index) => {
      const prevFrame = (prevFrames || [])[index];
      const prevVars = toMap(prevFrame && prevFrame.vars);
      const vars = (frame.vars || []).map((node) => renderVar(node, prevVars)).join('');
      return `<div class="frame${index === 0 ? ' current' : ''}">` +
        `<div class="frame-head"><span class="frame-fn">${escapeHtml(frame.fn)}</span>` +
        `<span class="frame-depth">栈深 ${frame.depth}</span></div>` +
        `<div class="frame-vars">${vars || '<span class="hint">（无局部变量）</span>'}</div></div>`;
    }).join('');
  }

  return { renderFrames };
})();
