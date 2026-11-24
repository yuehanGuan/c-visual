/* Timeline view: per-variable value trend across steps.
 *
 * Numeric variables become an SVG sparkline (polyline) with a dot on the
 * current step; anything else becomes a tick bar where a step that changed
 * the value is highlighted.
 */

const Timeline = (() => {
  const MAX_VARS = 6;
  const PLOT_H = 22;
  const PAD_T = 3;
  /* Horizontal room taken by the row itself: container padding (12+12),
   * the 60px name column and the 8px gap. The plot takes the rest. */
  const CHROME_W = 24 + 60 + 8;

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Innermost frame of a step: frames[0] holds the current function. */
  function innerFrame(step) {
    const frames = (step && step.frames) || [];
    return frames.length ? frames[0] : null;
  }

  /* Raw value of a node: scalar -> its text, seq -> element count.
   * Returns null for nodes we do not track (opaque, record, ...). */
  function rawOf(node) {
    if (!node) return null;
    if (node.kind === 'scalar') {
      if (node.value === undefined || node.value === null) return null;
      return String(node.value);
    }
    if (node.kind === 'seq') {
      const items = Array.isArray(node.items) ? node.items : [];
      return String(items.length);
    }
    return null;
  }

  /* Numeric test: empty strings are not numbers (Number('') === 0). */
  function toNumber(text) {
    if (text === null || text === undefined) return null;
    const s = String(text).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /* Variable names in order of first appearance in the innermost frame. */
  function collectNames(steps) {
    const names = [];
    const seen = {};
    (steps || []).forEach((step) => {
      const frame = innerFrame(step);
      ((frame && frame.vars) || []).forEach((node) => {
        if (!node || !node.name) return;
        if (seen[node.name]) return;
        seen[node.name] = true;
        names.push(node.name);
      });
    });
    return names.slice(0, MAX_VARS);
  }

  /* Points of one variable: step index -> raw value text. */
  function collectPoints(steps, name) {
    const points = [];
    (steps || []).forEach((step, idx) => {
      const frame = innerFrame(step);
      const vars = (frame && frame.vars) || [];
      let node = null;
      for (const v of vars) {
        if (v && v.name === name) { node = v; break; }
      }
      if (!node) return;
      const raw = rawOf(node);
      if (raw === null) return;
      points.push({ step: idx, raw: raw });
    });
    return points;
  }

  /* SVG sparkline for numeric variables. */
  function renderSparkline(points, width, currentIdx) {
    const nums = points.map((p) => toNumber(p.raw));
    if (nums.some((n) => n === null) || points.length < 2) return null;
    let min = Math.min.apply(null, nums);
    let max = Math.max.apply(null, nums);
    const firstStep = points[0].step;
    const lastStep = points[points.length - 1].step;
    const span = lastStep - firstStep;
    const xOf = (step) => (span === 0 ? width / 2 : ((step - firstStep) / span) * width);
    const yOf = (n) => {
      if (max === min) return PAD_T + (PLOT_H - PAD_T) / 2;
      return PAD_T + (1 - (n - min) / (max - min)) * (PLOT_H - PAD_T * 2);
    };
    const coords = points.map((p, i) => `${xOf(p.step).toFixed(1)},${yOf(nums[i]).toFixed(1)}`);
    const parts = [];
    parts.push(`<svg class="tl-spark" width="${width}" height="${PLOT_H}" viewBox="0 0 ${width} ${PLOT_H}">`);
    parts.push(`<polyline class="tl-line" points="${coords.join(' ')}"/>`);
    /* Dot on the current step: the latest known value at or before it. */
    let dot = null;
    for (let i = 0; i < points.length; i++) {
      if (points[i].step <= currentIdx) dot = { x: xOf(points[i].step), y: yOf(nums[i]) };
    }
    if (dot) {
      parts.push(`<circle class="tl-dot" cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="2.6"/>`);
    }
    parts.push('</svg>');
    return parts.join('');
  }

  /* Tick bar for non-numeric variables: one tick per step, changed ones lit. */
  function renderTicks(points, width, currentIdx) {
    const firstStep = points.length ? points[0].step : 0;
    const lastStep = points.length ? points[points.length - 1].step : 0;
    const span = lastStep - firstStep;
    const xOf = (step) => (span === 0 ? width / 2 : ((step - firstStep) / span) * width);
    const parts = [];
    parts.push(`<svg class="tl-ticks" width="${width}" height="${PLOT_H}" viewBox="0 0 ${width} ${PLOT_H}">`);
    points.forEach((p, i) => {
      const changed = i === 0 || p.raw !== points[i - 1].raw;
      const x = xOf(p.step);
      const h = changed ? PLOT_H - 6 : 6;
      const y = PLOT_H - h - 1;
      const cur = p.step === currentIdx;
      parts.push(`<line class="tl-tick${changed ? ' changed' : ''}${cur ? ' current' : ''}" x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${PLOT_H - 1}"/>`);
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function render(container, steps, currentIdx) {
    if (!container) return;
    const list = Array.isArray(steps) ? steps : [];
    if (!list.length) {
      container.innerHTML = '<div class="tl-title">轨迹</div><p class="empty">（无轨迹数据）</p>';
      return;
    }
    const names = collectNames(list);
    if (!names.length) {
      container.innerHTML = '<div class="tl-title">轨迹</div><p class="empty">（无轨迹数据）</p>';
      return;
    }
    const width = Math.max((container.clientWidth || 520) - CHROME_W, 60);
    const cur = Number(currentIdx) || 0;
    const rows = [];
    names.forEach((name) => {
      const points = collectPoints(list, name);
      if (!points.length) return;
      const numeric = points.length >= 2 && points.every((p) => toNumber(p.raw) !== null);
      const plot = numeric
        ? renderSparkline(points, width, cur)
        : renderTicks(points, width, cur);
      rows.push(
        `<div class="tl-row" data-var="${escapeHtml(name)}">` +
        `<span class="tl-name">${escapeHtml(name)}</span>` +
        `<span class="tl-plot">${plot}</span>` +
        '</div>'
      );
    });
    if (!rows.length) {
      container.innerHTML = '<div class="tl-title">轨迹</div><p class="empty">（无轨迹数据）</p>';
      return;
    }
    container.innerHTML = `<div class="tl-title">轨迹</div>${rows.join('')}`;
  }

  return { render, collectNames, collectPoints, toNumber };
})();
