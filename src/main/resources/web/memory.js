/* Memory view: render stack frames as an SVG "stack of memory cards".
 *
 * Data comes from the trace schema (docs/TRACE_SCHEMA.md):
 *   step.frames[] = { fn, depth, vars: [ {name, type, kind, value?, items?, ...} ] }
 * Each variable node may carry an `addr` (hex string) for scalars/pointers.
 */

const Memory = (() => {
  const ROW_H = 26;
  const FRAME_TOP = 34;
  const FRAME_PAD = 10;
  const FRAME_GAP = 8;
  const X_NAME = 24;
  const X_TYPE = 110;
  const X_VALUE = 200;
  const MAX_VALUE_CHARS = 28;
  const MAX_RECORD_FIELDS = 4;
  const MAX_MAP_PAIRS = 3;
  const MAX_SET_ITEMS = 6;
  const MAX_TYPE_CHARS = 11;
  const MAX_NAME_CHARS = 10;
  /* Diff summary bar: at most 3 items, values cut at 12 chars. */
  const MAX_DIFF_ITEMS = 3;
  const MAX_DIFF_VALUE_CHARS = 12;
  const CELL_W = 40;
  const CELL_H = 24;
  const CELL_GAP = 3;
  const MAX_GHOST = 24;
  const CELL_TEXT_MAX = 6;
  const BLOCK_H = 22 + 24 + 16;
  const BLOCK_GAP = 10;
  const HEAP_GAP = 16;
  const STACK_ARRAY_EXTRA = 52;
  /* Right gutter reserved for pointer arrows, so arrows never overlap text. */
  const RIGHT_MARGIN = 44;

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* '0x00007ffd0a1b2c3d' -> '0xc3d' */
  function addrShort(a) {
    if (a === undefined || a === null || a === '') return '';
    const s = String(a);
    const hex = s.startsWith('0x') ? s.slice(2) : s;
    if (!hex) return '';
    return '0x' + hex.slice(-3);
  }

  /* One-line value text for a variable node, whatever its kind. */
  function textOf(node) {
    if (!node) return '';
    switch (node.kind) {
      case 'seq':
        return `[${(node.items || []).join(', ')}]`;
      case 'grid':
        return `${(node.rows || []).length} x ${(node.rows && node.rows[0] ? node.rows[0].length : 0)}`;
      case 'text':
        return `"${node.value || ''}"`;
      case 'record': {
        const fields = Array.isArray(node.fields) ? node.fields : [];
        const shown = fields.slice(0, MAX_RECORD_FIELDS).map((f) => {
          const fname = f && f.name ? String(f.name) : '?';
          return `${fname} = ${textOf(f)}`;
        });
        const items = shown.slice();
        if (fields.length > MAX_RECORD_FIELDS) items.push('…');
        else if (node.truncated === true) items.push('…');
        return `{ ${items.join(', ')} }`;
      }
      case 'map': {
        const items = Array.isArray(node.items) ? node.items : [];
        if (!items.length) return '{ }';
        const shown = items.slice(0, MAX_MAP_PAIRS).map((it) => {
          const k = it && it.k !== undefined && it.k !== null ? String(it.k) : '?';
          const v = it && it.v !== undefined && it.v !== null ? String(it.v) : '?';
          return `${k}: ${v}`;
        });
        if (items.length > MAX_MAP_PAIRS) shown.push('…');
        return `{ ${shown.join(', ')} }`;
      }
      case 'set': {
        const items = Array.isArray(node.items) ? node.items : [];
        if (!items.length) return '{ }';
        const shown = items.slice(0, MAX_SET_ITEMS).map((it) => String(it));
        if (items.length > MAX_SET_ITEMS) shown.push('…');
        return `{ ${shown.join(', ')} }`;
      }
      case 'queue': {
        const items = Array.isArray(node.items) ? node.items : [];
        if (!items.length) return '[ ]';
        const shown = items.slice(0, MAX_SET_ITEMS).map((it) => String(it));
        if (items.length > MAX_SET_ITEMS) shown.push('…');
        const body = `[ ${shown.join(' | ')} ]`;
        const full = `front → ${body} ← back`;
        return full.length <= MAX_VALUE_CHARS ? full : body;
      }
      case 'stack': {
        const items = Array.isArray(node.items) ? node.items : [];
        if (!items.length) return '[ ]';
        const shown = items.slice(0, MAX_SET_ITEMS).map((it) => String(it));
        if (items.length > MAX_SET_ITEMS) shown.push('…');
        const body = `[ ${shown.join(' | ')} ]`;
        const full = `${body} ← top`;
        return full.length <= MAX_VALUE_CHARS ? full : body;
      }
      case 'pair': {
        const a = node.first === undefined || node.first === null ? '?' : String(node.first);
        const b = node.second === undefined || node.second === null ? '?' : String(node.second);
        return `( ${a}, ${b} )`;
      }
      case 'scalar':
        return node.value === undefined ? '' : String(node.value);
      case 'opaque': {
        const t = node.type || '未知类型';
        const v = node.value === undefined || node.value === null ? '' : String(node.value);
        return v ? v : `${t}（不支持的类型）`;
      }
      case 'ptr': {
        if (node.target === '0x0') return '→ null';
        const t = node.target === undefined || node.target === null ? '' : String(node.target);
        const v = node.value === undefined || node.value === null ? '' : String(node.value);
        const shown = t || v;
        return shown ? `→ ${shown}` : '→ ?';
      }
      default:
        if (node.value !== undefined && node.value !== null) return String(node.value);
        return node.type ? String(node.type) : '未知类型';
    }
  }

  function truncate(text) {
    const s = String(text);
    return s.length > MAX_VALUE_CHARS ? s.slice(0, MAX_VALUE_CHARS) + '…' : s;
  }

  /* Frame identity: fn + depth. Index-based alignment mislabels every frame
   * when a recursive call pushes or pops (known bug B3). */
  function frameKey(frame) {
    if (!frame) return '';
    return String(frame.fn || '?') + '#' + String(frame.depth === undefined ? '' : frame.depth);
  }

  /* Previous frames indexed by identity, so a frame only compares against the
   * frame that was in the same place in the call stack. */
  function indexPrevFrames(prevFrames) {
    const map = {};
    (prevFrames || []).forEach((f) => {
      const k = frameKey(f);
      if (!map[k]) map[k] = f;
    });
    return map;
  }

  /* Comparable summary of a variable node: a short string that changes when
   * the value changes. Used by the diff summary bar. */
  function summaryValue(node) {
    if (!node) return '';
    switch (node.kind) {
      case 'scalar':
        return node.value === undefined || node.value === null ? '' : String(node.value);
      case 'seq': {
        const items = Array.isArray(node.items) ? node.items : [];
        const cap = node.capacity === undefined || node.capacity === null ? '' : String(node.capacity);
        return items.join(',') + (cap === '' ? '' : '/' + cap);
      }
      case 'map':
      case 'set': {
        const items = Array.isArray(node.items) ? node.items : [];
        return items.map((it) => (it && typeof it === 'object' ? (it.k + ':' + it.v) : String(it))).join(',');
      }
      case 'pair': {
        const a = node.first === undefined || node.first === null ? '' : String(node.first);
        const b = node.second === undefined || node.second === null ? '' : String(node.second);
        return a + ',' + b;
      }
      default:
        return node.type ? String(node.type) : '';
    }
  }

  /* Cut a long summary value to MAX_DIFF_VALUE_CHARS, keeping head and tail.
   * Tail-only truncation would render two different sequences as the same
   * text ("1,2,3,… → 1,2,3,…"), hiding where the value actually changed. */
  function truncateDiffValue(text) {
    const s = String(text);
    if (s.length <= MAX_DIFF_VALUE_CHARS) return s;
    const head = Math.ceil((MAX_DIFF_VALUE_CHARS - 1) / 2);
    const tail = MAX_DIFF_VALUE_CHARS - 1 - head;
    return s.slice(0, head) + '…' + (tail > 0 ? s.slice(-tail) : '');
  }

  /* Diff summary bar for the innermost frame: what changed since the last
   * step, and from which value to which one. Empty when nothing changed. */
  function renderDiffSummary(step, prevStep) {
    const frames = (step && step.frames) || [];
    if (!frames.length) return '';
    const frame = frames.find((f) => f && f.depth === 0) || frames[0];
    const prevFrames = (prevStep && prevStep.frames) || [];
    const prevFrame = indexPrevFrames(prevFrames)[frameKey(frame)];
    if (!prevFrame) return '';
    const prevVars = {};
    ((prevFrame.vars) || []).forEach((v) => { if (v && v.name) prevVars[v.name] = v; });
    const items = [];
    ((frame.vars) || []).forEach((node) => {
      if (!node || !node.name) return;
      const prev = prevVars[node.name];
      if (!prev) return;
      const oldV = summaryValue(prev);
      const newV = summaryValue(node);
      if (oldV === newV) return;
      items.push({ name: node.name, old: oldV, now: newV });
    });
    if (!items.length) return '';
    const shown = items.slice(0, MAX_DIFF_ITEMS);
    const parts = shown.map((it) =>
      `<span class="diff-item">${escapeHtml(it.name)}: ${escapeHtml(truncateDiffValue(it.old))} → ${escapeHtml(truncateDiffValue(it.now))}</span>`);
    if (items.length > MAX_DIFF_ITEMS) {
      parts.push(`<span class="diff-more">+${items.length - MAX_DIFF_ITEMS}</span>`);
    }
    return `<div class="mem-diff">${parts.join('')}</div>`;
  }

  /* Types can be huge (std templates); keep the row readable. */
  function truncateType(text) {
    const s = String(text);
    return s.length > MAX_TYPE_CHARS ? s.slice(0, MAX_TYPE_CHARS) + '…' : s;
  }

  /* Global variable names are long (std::...); keep the name column narrow. */
  function truncateName(text) {
    const s = String(text);
    return s.length > MAX_NAME_CHARS ? s.slice(0, MAX_NAME_CHARS) + '…' : s;
  }

  /* One variable row inside a frame. */
  function renderSlot(node, prevNode, frame, y, width) {
    const name = node && node.name ? truncateName(node.name) : '?';
    const type = node && node.type ? truncateType(node.type) : '';
    const isSeq = !!node && node.kind === 'seq';
    const isOpaque = !!node && node.kind === 'opaque';
    const isRecord = !!node && node.kind === 'record';
    const isMap = !!node && node.kind === 'map';
    const isSet = !!node && node.kind === 'set';
    const isPair = !!node && node.kind === 'pair';
    const isQueue = !!node && node.kind === 'queue';
    const isStack = !!node && node.kind === 'stack';
    const seqMeta = isSeq
      ? ('size ' + (node.size !== undefined ? node.size : (node.items || []).length) +
         (node.capacity !== undefined ? ' · cap ' + node.capacity : ''))
      : '';
    const rawValue = isSeq ? seqMeta : truncate(textOf(node));
    const value = rawValue === '' ? '—' : rawValue;
    const valueClass = isSeq || isOpaque ? 'seq-meta' : 'slot-value';
    const tip = isQueue
      ? `front → ${textOf(node)} ← back`
      : (isStack ? `${textOf(node)} ← top` : '');
    const changed = !!prevNode && textOf(prevNode) !== textOf(node);
    const addr = node ? (node.addr || node.dataAddr || '') : '';
    const addrText = addrShort(addr);
    const right = width - 26;
    const y0 = y + ROW_H - 8;

    const parts = [];
    parts.push(`<g class="slot${isRecord ? ' record' : ''}${isMap ? ' map' : ''}${isSet ? ' set' : ''}${isPair ? ' pair' : ''}${isQueue ? ' queue' : ''}${isStack ? ' stack' : ''}${changed ? ' changed' : ''}" data-var="${escapeHtml(name)}">`);
    parts.push(`<rect x="12" y="${y}" width="${width - 24}" height="${ROW_H - 4}" rx="4"/>`);
    parts.push(`<text class="slot-name" x="${X_NAME}" y="${y0}">${escapeHtml(name)}</text>`);
    parts.push(`<text class="slot-type" x="${X_TYPE}" y="${y0}">${escapeHtml(type)}</text>`);
    parts.push(`<text class="${valueClass}" x="${X_VALUE}" y="${y0}"${tip ? `><title>${escapeHtml(tip)}</title>${escapeHtml(value)}</text>` : `>${escapeHtml(value)}</text>`}`);
    if (addrText) {
      parts.push(`<text class="slot-addr" x="${right}" y="${y0}" text-anchor="end">${escapeHtml(addrText)}</text>`);
    }
    parts.push('</g>');
    return parts.join('');
  }

  /* Right edge of the frame card: row boxes end here, margin starts after it. */
  function frameRight(cardW) { return 12 + (cardW - 24); }

  /* Pointer fields nested inside a record point at their own row too. */
  function collectNestedPtrs(node, addrPoints, ptrLinks, width, mid) {
    const fields = (node && node.kind === 'record' && Array.isArray(node.fields)) ? node.fields : [];
    fields.forEach((f) => {
      if (!f) return;
      if (f.addr && !addrPoints[f.addr]) addrPoints[f.addr] = { x: frameRight(width) + 6, y: mid };
      if (f.kind === 'ptr' && f.target && f.target !== '0x0') {
        ptrLinks.push({ target: f.target, from: { x: frameRight(width) - 4, y: mid }, value: f.value });
      }
      collectNestedPtrs(f, addrPoints, ptrLinks, width, mid);
    });
  }

  /* One frame card: header + variable rows. */
  function renderFrame(frame, prevFrame, y, width, heapAddrs, anim) {
    const vars = (frame && frame.vars) || [];
    const prevVars = {};
    ((prevFrame && prevFrame.vars) || []).forEach((v) => { prevVars[v.name] = v; });
    const cardW = width - RIGHT_MARGIN;

    const stackCount = vars.filter((n) => n && n.kind === 'seq' && n.dataAddr && !heapAddrs[n.dataAddr]).length;
    const height = FRAME_TOP + ROW_H * vars.length + FRAME_PAD + STACK_ARRAY_EXTRA * stackCount;
    const anchors = [];
    const addrPoints = {};
    const ptrLinks = [];
    const parts = [];
    const animCls = anim && frame.depth === 0 ? ' frame-' + anim : '';
    parts.push(`<g class="frame${animCls}" data-depth="${frame.depth}">`);
    parts.push(`<rect class="frame-box" x="12" y="${y}" width="${cardW - 24}" height="${height}" rx="8"/>`);
    parts.push(`<text class="frame-fn" x="24" y="${y + 22}">${escapeHtml(frame.fn || '?')}</text>`);
    parts.push(`<text class="frame-depth" x="${cardW - 24}" y="${y + 22}" text-anchor="end">栈深 ${frame.depth}</text>`);
    parts.push(`<line class="frame-rule" x1="24" y1="${y + 30}" x2="${cardW - 24}" y2="${y + 30}"/>`);
    let rowY = y + FRAME_TOP;
    vars.forEach((node) => {
      if (node) {
        const mid = rowY + ROW_H / 2;
        const ownAddr = node.addr || '';
        const dataAddr = node.dataAddr || '';
        if (ownAddr && !addrPoints[ownAddr]) addrPoints[ownAddr] = { x: frameRight(cardW) + 6, y: mid };
        if (dataAddr && !addrPoints[dataAddr]) addrPoints[dataAddr] = { x: frameRight(cardW) + 6, y: mid };
        if (node.kind === 'ptr' && node.target && node.target !== '0x0') {
          ptrLinks.push({ target: node.target, from: { x: frameRight(cardW) - 4, y: mid }, value: node.value });
        }
        collectNestedPtrs(node, addrPoints, ptrLinks, cardW, mid);
      }
      parts.push(renderSlot(node, prevVars[node.name], frame, rowY, cardW));
      if (node && node.kind === 'seq' && node.dataAddr) {
        anchors.push({ addr: node.dataAddr, x: cardW - 26, y: rowY + ROW_H / 2, from: true });
        if (!heapAddrs[node.dataAddr]) {
          const prev = prevVars[node.name];
          const cells = renderCells(node.items, node.capacity, prev ? prev.items : null);
          parts.push(`<g class="stack-array" transform="translate(24, ${rowY + ROW_H + 8})">${cells.svg}</g>`);
          rowY += STACK_ARRAY_EXTRA;
        }
      }
      rowY += ROW_H;
    });
    parts.push('</g>');
    return { svg: parts.join(''), height: height, anchors: anchors, addrPoints: addrPoints, ptrLinks: ptrLinks };
  }

  /* A row of memory cells: one rect per item, ghost slots for spare capacity. */
  function renderCells(items, capacity, prevItems) {
    const list = Array.isArray(items) ? items : [];
    /* null prevItems = no baseline frame: mark nothing changed. */
    const hasPrev = Array.isArray(prevItems);
    const prev = hasPrev ? prevItems : [];
    const cap = Number(capacity);
    const totalCap = Number.isFinite(cap) && cap > list.length ? Math.floor(cap) : list.length;
    const ghosts = totalCap - list.length;
    const ghostCount = Math.min(ghosts, MAX_GHOST);
    const parts = ['<g class="cells">'];
    list.forEach((val, i) => {
      const x = i * (CELL_W + CELL_GAP);
      const changed = hasPrev && String(prev[i]) !== String(val);
      let text = String(val);
      if (text.length > CELL_TEXT_MAX) text = text.slice(0, CELL_TEXT_MAX) + '…';
      parts.push('<g class="cell">');
      parts.push(`<text class="cell-idx" x="${x + CELL_W / 2}" y="4" text-anchor="middle">${i}</text>`);
      parts.push(`<rect x="${x}" y="14" width="${CELL_W}" height="${CELL_H}" rx="4"${changed ? ' class="changed"' : ''}/>`);
      parts.push(`<text x="${x + CELL_W / 2}" y="30" text-anchor="middle">${escapeHtml(text)}</text>`);
      parts.push('</g>');
    });
    for (let j = 0; j < ghostCount; j++) {
      const idx = list.length + j;
      const x = idx * (CELL_W + CELL_GAP);
      const last = ghosts > MAX_GHOST && j === ghostCount - 1;
      parts.push(`<rect class="ghost" x="${x}" y="14" width="${CELL_W}" height="${CELL_H}" rx="4"/>`);
      if (last) parts.push(`<text x="${x + CELL_W / 2}" y="30" text-anchor="middle">+${ghosts - MAX_GHOST}</text>`);
    }
    parts.push('</g>');
    const count = list.length + ghostCount;
    return { svg: parts.join(''), width: count ? count * (CELL_W + CELL_GAP) - CELL_GAP : 0 };
  }

  /* Heap blocks drawn under the stack frames. */
  function renderHeap(heap, prevHeap, y, width) {
    const blocks = Array.isArray(heap) ? heap : [];
    if (!blocks.length) return { svg: '', height: 0 };
    const prevByAddr = {};
    (Array.isArray(prevHeap) ? prevHeap : []).forEach((b) => { if (b && b.addr) prevByAddr[b.addr] = b; });
    const anchors = [];
    const parts = [];
    parts.push(`<text class="heap-title" x="16" y="${y}">堆</text>`);
    parts.push(`<text class="heap-title" x="${width - 16}" y="${y}" text-anchor="end">${escapeHtml(addrShort(blocks[0].addr))}</text>`);
    let by = y + 22;
    blocks.forEach((b) => {
      const prev = b.addr ? prevByAddr[b.addr] : null;
      const cells = renderCells(b.items, b.capacity, prev ? prev.items : null);
      const count = b.count !== undefined ? b.count : (b.items || []).length;
      const capTxt = b.capacity === undefined ? '' : `  cap ${b.capacity}`;
      const head = `${addrShort(b.addr)}  ${b.type || '?'}[${count}]${capTxt}`;
      parts.push(`<g class="heap-block" data-addr="${escapeHtml(b.addr || '')}">`);
      parts.push(`<text class="heap-head" x="16" y="${by + 12}">${escapeHtml(head)}</text>`);
      parts.push(`<g transform="translate(16, ${by + 20})">${cells.svg}</g>`);
      parts.push('</g>');
      anchors.push({ addr: b.addr, x: 16 + cells.width, y: by + 20 + 26, from: false });
      by += BLOCK_H + BLOCK_GAP;
    });
    return { svg: parts.join(''), height: by - BLOCK_GAP - y, anchors: anchors };
  }

  /* Arrows from stack variables to the heap blocks they point at. */
  function renderArrows(anchors) {
    const frames = anchors.filter((a) => a.from !== false && a.addr !== undefined);
    const blocks = anchors.filter((a) => a.from === false);
    const parts = [];
    frames.forEach((a) => {
      const b = blocks.find((x) => x.addr === a.addr);
      if (!b) return;
      const ax = a.x, ay = a.y, bx = b.x, by = b.y;
      const mx = (ax + bx) / 2;
      const lx = mx, ly = (ay + by) / 2 - 6;
      const dir = Math.sign(bx - ax) || 1;
      const cx1 = ax + dir * 16, cx2 = bx + dir * 16;
      const d = ax === bx ? `M ${ax},${ay} L ${bx},${by}` : `M ${ax},${ay} C ${cx1},${ay} ${cx2},${by} ${bx},${by}`;
      parts.push(`<path class="mem-arrow" marker-end="url(#mem-arrow)" d="${d}"/>`);
      parts.push(`<text class="mem-arrow-label" x="${lx}" y="${ly}" text-anchor="middle">${escapeHtml(addrShort(a.addr))}</text>`);
    });
    return parts.join('');
  }

  /* Arrows from pointer variables to the variable they point at.
   * Geometry: both ends live on the right margin of the frame, so the curve
   * bulges outward in the whitespace and never crosses the row text. */
  const MAX_PTR_ARROWS = 4;

  function renderPtrArrows(ptrLinks, addrPoints, width, height) {
    const parts = [];
    /* Pointer arrows stay inside the frame: both ends sit on the frame's right
     * edge and the curve bulges into the right gutter, so the tip is never
     * clipped by the SVG border. */
    const W = width;
    const R = frameRight(W - RIGHT_MARGIN);
    const endX = R - 4;
    const ctrlX = Math.min(W - 8, R + 24);
    const clampX = (v) => Math.max(0, Math.min(width, Math.round(v)));
    const clampY = (v) => Math.max(0, Math.min(height, Math.round(v)));
    const seen = {};
    let drawn = 0;
    let overflow = 0;
    let miss = 0;
    /* Numeric index of address points: address strings may differ in case or
     * leading zeros, so a strict string key lookup can miss. */
    const byNum = {};
    Object.keys(addrPoints || {}).forEach((k) => {
      const n = Number(k);
      if (Number.isSafeInteger(n)) byNum[n] = addrPoints[k];
    });
    let firstLabelX = 0;
    let firstLabelY = 0;
    (ptrLinks || []).forEach((link) => {
      const target = (addrPoints && addrPoints[link.target]) || byNum[Number(link.target)];
      const fx = endX;
      const fy = clampY(link.from.y);
      const key = fy + '|' + (link.target || '?');
      if (seen[key]) return;
      seen[key] = true;
      if (!target) {
        miss++;
        const ex = clampX(fx + 18);
        parts.push(`<path class="mem-arrow ptr-arrow" d="M ${fx},${fy} L ${ex},${fy}"/>`);
        parts.push(`<text class="ptr-miss" x="${clampX(ex + 4)}" y="${clampY(fy + 4)}">?</text>`);
        return;
      }
      if (drawn >= MAX_PTR_ARROWS) { overflow++; return; }
      const tx = endX;
      const ty = clampY(target.y);
      const d = `M ${fx},${fy} C ${ctrlX},${fy} ${ctrlX},${ty} ${tx},${ty}`;
      parts.push(`<path class="mem-arrow ptr-arrow" marker-end="url(#mem-arrow-ptr)" d="${d}"/>`);
      if (drawn === 0) { firstLabelX = clampX(tx + 20); firstLabelY = clampY(ty - 4); }
      drawn++;
    });
    if (overflow > 0) {
      parts.push(`<text class="ptr-miss" x="${firstLabelX}" y="${firstLabelY}">+${overflow}</text>`);
    }
    return {
      svg: parts.join(''),
      drawn: drawn,
      miss: miss,
      debug: {
        keys: Object.keys(addrPoints || {}),
        targets: (ptrLinks || []).map((l) => l.target),
      },
    };
  }

  function render(container, step, prevStep) {
    if (!container) return;
    const frames = (step && step.frames) || [];
    const hasHeap = ((step && step.heap) || []).length > 0;
    if (!frames.length && !hasHeap) {
      container.innerHTML = '<div class="hint">（当前步骤没有栈帧）</div>';
      return;
    }
    const width = Math.max(container.clientWidth || 520, 320);
    const prevFrames = (prevStep && prevStep.frames) || [];
    /* Push / pop transitions: a new innermost frame slides in, a return
     * flashes the frame we came back to.  No animation on the first paint. */
    const anim = !prevStep ? ''
      : (frames.length > prevFrames.length ? 'in'
        : (frames.length < prevFrames.length ? 'return' : ''));
    const prevByKey = indexPrevFrames(prevFrames);
    const heapAddrs = {};
    ((step && step.heap) || []).forEach((b) => { if (b && b.addr) heapAddrs[b.addr] = true; });

    const body = [];
    const anchors = [];
    const addrPoints = {};
    const ptrLinks = [];
    let y = 34;
    frames.forEach((frame) => {
      const rendered = renderFrame(frame, prevByKey[frameKey(frame)], y, width, heapAddrs, anim);
      body.push(rendered.svg);
      rendered.anchors.forEach((a) => anchors.push(a));
      Object.keys(rendered.addrPoints || {}).forEach((addr) => {
        if (!addrPoints[addr]) addrPoints[addr] = rendered.addrPoints[addr];
      });
      (rendered.ptrLinks || []).forEach((l) => ptrLinks.push(l));
      y += rendered.height + FRAME_GAP;
    });
    if (frames.length) y -= FRAME_GAP;
    const heap = renderHeap(step && step.heap, prevStep && prevStep.heap, y + HEAP_GAP, width);
    if (heap.height > 0) {
      body.push(heap.svg);
      heap.anchors.forEach((a) => anchors.push(a));
      y += HEAP_GAP + heap.height;
    }
    const height = y + 8;

    body.push(renderArrows(anchors));
    const ptr = renderPtrArrows(ptrLinks, addrPoints, width, height);
    body.push(ptr.svg);

    const head = `<text class="mem-title" x="16" y="20">栈</text>`;
    const defs =
      '<defs>' +
      '<marker id="mem-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" orient="auto">' +
      '<path d="M0,0 L8,4 L0,8 z" fill="#7fd6ff"/></marker>' +
      '<marker id="mem-arrow-ptr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="9" markerHeight="9" orient="auto">' +
      '<path d="M0,0 L8,4 L0,8 z" fill="#d0a9ff"/></marker>' +
      '</defs>';
    const summary = renderDiffSummary(step, prevStep);
    container.innerHTML =
      summary +
      `<svg class="mem" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"` +
      ` data-ptr-drawn="${ptr.drawn}" data-ptr-miss="${ptr.miss}"` +
      ` data-frame-anim="${anim || 'none'}"` +
      ` data-ptr-debug="${escapeHtml(JSON.stringify(ptr.debug)).replace(/"/g, '&quot;')}">` +
      defs + head + body.join('') + '</svg>';
  }

  return { render, escapeHtml, addrShort, textOf };
})();
