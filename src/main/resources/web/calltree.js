/* calltree.js — recursive call tree for the execution trace.
 *
 * Contract (docs/TRACE-CONTRACT.md):
 *   step.frames[0] is the INNERMOST frame.
 *   frame.fn carries the signature, e.g. "fib(int)".
 *   Scalar arguments live in frame.vars as {name, kind:"scalar", value}.
 *
 * A node label is the function name plus up to two scalar arguments,
 * e.g. "fib(int) n=3".  Two activations are the same node only when both
 * the function name AND the argument labels match — comparing names alone
 * would collapse a recursion into a flat chain.
 */
(function (global) {
  'use strict';

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* Label: function signature plus its scalar arguments, e.g. "fib(int) n=3". */
  function makeLabel(step, fn, depth) {
    const frames = (step && step.frames) || [];
    const frame = frames.length ? frames[frames.length - 1 - depth] : null;
    const vars = (frame && frame.vars) || [];
    const parts = [];
    for (let i = 0; i < vars.length && parts.length < 2; i++) {
      const v = vars[i];
      if (!v || v.kind !== 'scalar') continue;
      const value = v.value === undefined || v.value === null ? '' : String(v.value);
      parts.push(v.name + '=' + value);
    }
    return parts.length ? fn + ' ' + parts.join(' ') : fn;
  }

  /* Node identity: function name plus rendered argument label. */
  function makeKey(fn, label) {
    return fn + '\u0000' + label;
  }

  function ensureStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('ct-style')) return;
    const style = document.createElement('style');
    style.id = 'ct-style';
    style.textContent = [
      '.ct-root{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d7dce5}',
      '.ct-node{padding:1px 0}',
      '.ct-node.ct-returned{color:#6b7280}',
      '.ct-node.ct-active>.ct-row>.ct-fn{color:#7ee787}',
      '.ct-fn{white-space:pre}',
      '.ct-count{color:#8b949e;margin-left:6px}',
      '.ct-children{padding-left:14px;border-left:1px dotted #30363d}',
      '.ct-empty{color:#8b949e;font-style:italic}',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* Rebuild the activation tree over the whole trace.
   * Returns { roots, stackAt } where stackAt[i] = live nodes at step i. */
  function buildTree(steps) {
    const roots = [];
    const stackAt = [];
    const stack = [];

    (steps || []).forEach(function (step, i) {
      const frames = (step && step.frames) || [];
      const path = frames.map(function (f) { return (f && f.fn) || '?'; }).reverse();

      /* Longest common prefix of the live stack and the new path.
       * ONLY the function name identifies a frame: the rendered label
       * carries runtime values (a local may go from "opaque" to a real
       * value mid-trace), and comparing labels would split one function
       * into several roots.  Argument values belong to the node's
       * display label, never to its identity. */
      let k = 0;
      while (k < stack.length && k < path.length && stack[k].fn === path[k]) k++;

      /* Frames above k popped: they returned. */
      for (let j = stack.length - 1; j >= k; j--) stack[j].lastStep = i - 1;
      stack.length = k;

      for (let j = k; j < path.length; j++) {
        const label = makeLabel(step, path[j], j);
        const node = {
          fn: path[j],
          label: label,
          key: makeKey(path[j], label),
          children: [],
          count: 1,
          firstStep: i,
          lastStep: i,
          parent: stack.length ? stack[stack.length - 1] : null,
        };
        if (node.parent) node.parent.children.push(node);
        else roots.push(node);
        stack.push(node);
      }
      for (let j = 0; j < stack.length; j++) stack[j].lastStep = i;
      stackAt[i] = stack.slice();
    });

    mergeSiblings(roots);
    return { roots: roots, stackAt: stackAt };
  }

  /* Merge adjacent siblings that share function name and argument label
   * into a single node showing how many times it was activated. */
  function mergeSiblings(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const merged = [];
      for (let j = 0; j < node.children.length; j++) {
        const child = node.children[j];
        const prev = merged.length ? merged[merged.length - 1] : null;
        if (prev && prev.key === child.key) {
          prev.count += child.count;
          if (child.firstStep < prev.firstStep) prev.firstStep = child.firstStep;
          if (child.lastStep > prev.lastStep) prev.lastStep = child.lastStep;
        } else {
          merged.push(child);
        }
      }
      node.children = merged;
      for (let j = 0; j < node.children.length; j++) mergeSiblings(node.children[j]);
    }
  }

  function countDescendants(node) {
    let total = 0;
    for (let i = 0; i < node.children.length; i++) {
      total += 1 + countDescendants(node.children[i]);
    }
    return total;
  }

  function renderNode(node, liveSet, idx, depth, html, stats) {
    if (node.firstStep > idx) return;
    const live = liveSet.has(node);
    const returned = !live && node.lastStep < idx;
    const state = live ? 'active' : (returned ? 'returned' : 'done');

    /* Children are always rendered: the whole recursion stays visible. */
    const kids = [];
    for (let i = 0; i < node.children.length; i++) {
      renderNode(node.children[i], liveSet, idx, depth + 1, kids, stats);
    }
    const inner = kids.length ? '<div class="ct-children">' + kids.join('') + '</div>' : '';

    stats.count++;
    if (state === 'active') stats.active++;
    if (state === 'returned') stats.returned++;

    const mark = node.children.length ? '▸' : '·';
    const label = '<span class="ct-row"><span class="ct-mark">' + mark + '</span>' +
      '<span class="ct-fn">' + escapeHtml(node.label) + '</span>' +
      (node.count > 1 ? '<span class="ct-count">×' + node.count + '</span>' : '') +
      (state === 'active' ? '<span class="ct-mark">▶</span>' : '') + '</span>';

    html.push('<div class="ct-node ct-' + state + '" data-fn="' + escapeHtml(node.fn) +
      '" data-depth="' + depth + '" data-state="' + state + '">' + label + inner + '</div>');
  }

  function render(container, steps, currentIdx) {
    if (!container) return;
    ensureStyle();
    const list = Array.isArray(steps) ? steps : [];
    const idx = Number(currentIdx) || 0;

    if (!list.length) {
      container.innerHTML = '<p class="ct-empty">（无调用）</p>';
      container.dataset.ctNodes = '0';
      container.dataset.ctActive = '0';
      container.dataset.ctReturned = '0';
      container.dataset.ctDepth = '0';
      return;
    }

    const tree = buildTree(list);
    const live = tree.stackAt[idx] || [];
    const liveSet = new Set(live);
    const stats = { count: 0, active: 0, returned: 0 };
    const html = [];
    for (let i = 0; i < tree.roots.length; i++) {
      renderNode(tree.roots[i], liveSet, idx, 0, html, stats);
    }

    container.innerHTML = stats.count
      ? '<div class="ct-root">' + html.join('') + '</div>'
      : '<p class="ct-empty">（无调用）</p>';
    container.dataset.ctNodes = String(stats.count);
    container.dataset.ctActive = String(stats.active);
    container.dataset.ctReturned = String(stats.returned);
    container.dataset.ctDepth = String(live.length);
  }

  global.CallTree = { buildTree: buildTree, render: render, countDescendants: countDescendants };
})(typeof window !== 'undefined' ? window : globalThis);
