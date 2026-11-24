#!/usr/bin/env node
/* calltree_trace_test.js — runs buildTree over a REAL lldb trace.
 *
 * Usage: node tests/calltree_trace_test.js <trace.log>
 *
 * The log is the raw lldb output; every line starts with "VIZ " and holds
 * one JSON record.  This proves the tree logic against real debugger data
 * rather than a hand-written fixture.
 */

'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'calltree.js'));
const { buildTree } = global.CallTree;

const logPath = process.argv[2];
if (!logPath) {
  console.error('usage: node calltree_trace_test.js <trace.log>');
  process.exit(2);
}

const steps = [];
for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
  if (!line.startsWith('VIZ ')) continue;
  const rec = JSON.parse(line.slice(4));
  if (rec.t === 'step') steps.push(rec);
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('   ok  ' + name);
  else { failures += 1; console.error('   FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

if (!steps.length) {
  console.error('FAIL: no step records in ' + logPath);
  process.exit(1);
}

const tree = buildTree(steps);

/* The trace is fib(4): main -> fib(4) -> fib(3) -> fib(2) -> fib(1). */
const fibFns = [];
(function walk(nodes) {
  for (const n of nodes) {
    if (n.fn === 'fib(int)') fibFns.push(n);
    walk(n.children);
  }
})(tree.roots);

check('trace has steps', steps.length >= 10, 'steps=' + steps.length);
check('root is main', tree.roots.length === 1 && tree.roots[0].fn === 'main', tree.roots[0] && tree.roots[0].fn);

/* Recursion appears as nested nodes, not one merged node. */
check('fib activations are distinct nodes', fibFns.length >= 3, 'fib nodes=' + fibFns.length);

/* The deepest live stack must exceed a single frame: recursion really nests. */
let maxDepth = 0;
for (const s of tree.stackAt) maxDepth = Math.max(maxDepth, s.length);
check('live stack nests deeper than 3 frames', maxDepth >= 4, 'maxDepth=' + maxDepth);

/* The main -> fib chain must exist: fib is a child of main. */
const mainChildren = tree.roots[0].children;
check('main has a fib child', mainChildren.some((c) => c.fn === 'fib(int)'),
  mainChildren.map((c) => c.fn).join(','));

/* Every fib node carries its argument value in the label. */
const labelled = fibFns.filter((n) => /n=\d+/.test(n.label));
check('fib labels carry the argument value', labelled.length === fibFns.length,
  fibFns.map((n) => n.label).join(' | '));

/* Labels should show decreasing arguments along the chain (4,3,2,1). */
const chain = [];
(function follow(n) {
  if (!n) return;
  chain.push(n.label);
  const next = n.children.find((c) => c.fn === 'fib(int)');
  if (next) follow(next);
})(mainChildren.find((c) => c.fn === 'fib(int)'));
check('argument values descend along the recursion chain',
  /n=4/.test(chain[0]) && /n=3/.test(chain[1]) && /n=2/.test(chain[2]) && /n=1/.test(chain[3]),
  chain.join(' -> '));

/* Render must survive a real trace. */
const container = { innerHTML: '', dataset: {} };
global.CallTree.render(container, steps, steps.length - 1);
check('render produced markup', container.innerHTML.length > 0);
check('render counted nodes', Number(container.dataset.ctNodes) >= fibFns.length,
  'nodes=' + container.dataset.ctNodes);

if (failures) {
  console.error('\nFAIL: ' + failures + ' assertion(s) failed');
  process.exit(1);
}
console.log('PASS (' + steps.length + ' steps, ' + fibFns.length + ' fib activations)');
