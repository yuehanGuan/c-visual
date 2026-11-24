#!/usr/bin/env node
/* calltree_test.js — unit test for the recursive call tree.
 *
 * Pure JS: no LLDB, no server, no browser.  The trace is synthesised so the
 * tree logic can be verified even when the local debugger is unavailable.
 *
 * Contract (see docs/TRACE-CONTRACT.md):
 *   step.frames[0] is the INNERMOST frame.
 *   frame.fn looks like "fib(int)"; scalars live in frame.vars.
 */

'use strict';

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'calltree.js'));
const { buildTree } = global.CallTree;

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('   ok  ' + name);
  } else {
    failures += 1;
    console.error('   FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

/* One frame, innermost first. */
function frame(fn, vars) {
  return { fn: fn, depth: 0, vars: vars || [] };
}

/* A step whose call stack is given outermost-first (readable order). */
function step(stack, n) {
  const frames = stack.slice().reverse().map(function (f) {
    return frame(f.fn, f.vars);
  });
  return { t: 'step', n: n, line: 1, frames: frames };
}

function scalar(name, value) {
  return { name: name, kind: 'scalar', type: 'int', value: String(value) };
}

/* ------------------------------------------------------------------ */
/* fib(3): main -> fib(3) -> fib(2) -> fib(1)                           */
/* ------------------------------------------------------------------ */

const steps = [
  step([{ fn: 'main(int)' }], 1),
  step([{ fn: 'main(int)' }, { fn: 'fib(int)', vars: [scalar('n', 3)] }], 2),
  step([{ fn: 'main(int)' }, { fn: 'fib(int)', vars: [scalar('n', 3)] },
        { fn: 'fib(int)', vars: [scalar('n', 2)] }], 3),
  step([{ fn: 'main(int)' }, { fn: 'fib(int)', vars: [scalar('n', 3)] },
        { fn: 'fib(int)', vars: [scalar('n', 2)] },
        { fn: 'fib(int)', vars: [scalar('n', 1)] }], 4),
  /* fib(1) returns: the stack shrinks back to fib(2). */
  step([{ fn: 'main(int)' }, { fn: 'fib(int)', vars: [scalar('n', 3)] },
        { fn: 'fib(int)', vars: [scalar('n', 2)] }], 5),
];

const tree = buildTree(steps);

check('buildTree returns roots and stackAt', Array.isArray(tree.roots) && Array.isArray(tree.stackAt));
check('one root (main)', tree.roots.length === 1, 'roots=' + tree.roots.length);
check('root is main', tree.roots[0] && tree.roots[0].fn === 'main(int)', tree.roots[0] && tree.roots[0].fn);

/* main -> fib(3) */
const fib3 = tree.roots[0].children[0];
check('main has one child', tree.roots[0].children.length === 1);
check('child is fib(3)', fib3 && fib3.label.indexOf('n=3') >= 0, fib3 && fib3.label);

/* fib(3) -> fib(2) -> fib(1): recursion is told apart by position. */
const fib2 = fib3.children[0];
const fib1 = fib2.children[0];
check('fib(3) -> fib(2)', fib2 && fib2.fn === 'fib(int)' && fib2.label.indexOf('n=2') >= 0, fib2 && fib2.label);
check('fib(2) -> fib(1)', fib1 && fib1.fn === 'fib(int)' && fib1.label.indexOf('n=1') >= 0, fib1 && fib1.label);
check('recursion nests rather than merging',
  fib3 !== fib2 && fib2 !== fib1 && fib1.children.length === 0);

/* Depth of the live stack grows then shrinks. */
check('stack depth grows to 4 at step 4', tree.stackAt[3].length === 4, 'len=' + tree.stackAt[3].length);
check('stack shrinks to 3 after fib(1) returns', tree.stackAt[4].length === 3, 'len=' + tree.stackAt[4].length);

/* Returned nodes are marked with a lastStep before the pop. */
check('fib(1) closed at step 4', fib1.lastStep === 3, 'lastStep=' + fib1.lastStep);
check('fib(2) still alive at step 5', fib2.lastStep === 4, 'lastStep=' + fib2.lastStep);

/* ------------------------------------------------------------------ */
/* Empty and malformed input must not throw.                            */
/* ------------------------------------------------------------------ */

check('empty trace -> no roots', buildTree([]).roots.length === 0);
check('null trace -> no roots', buildTree(null).roots.length === 0);
check('step without frames -> no roots', buildTree([{ t: 'step', n: 1 }]).roots.length === 0);
check('frame without fn -> placeholder',
  buildTree([{ t: 'step', n: 1, frames: [{}] }]).roots.length === 1);

/* ------------------------------------------------------------------ */
/* Render must produce a DOM-free fallback and set the data attributes. */
/* ------------------------------------------------------------------ */

const container = { innerHTML: '', dataset: {} };
global.CallTree.render(container, steps, 3);
check('render emits markup', container.innerHTML.indexOf('ct-root') >= 0);
check('render counts nodes', Number(container.dataset.ctNodes) >= 4, 'nodes=' + container.dataset.ctNodes);
check('render reports active depth', Number(container.dataset.ctDepth) === 4, 'depth=' + container.dataset.ctDepth);

/* At step 5 fib(1) has returned, so exactly that node counts as returned. */
const afterReturn = { innerHTML: '', dataset: {} };
global.CallTree.render(afterReturn, steps, 4);
check('render marks returned nodes', Number(afterReturn.dataset.ctReturned) === 1,
  'returned=' + afterReturn.dataset.ctReturned);
check('returned node carries the ct-returned class',
  afterReturn.innerHTML.indexOf('ct-returned') >= 0);
check('label is html-escaped',
  (function () {
    const c = { innerHTML: '', dataset: {} };
    global.CallTree.render(c, [step([{ fn: '<script>' }], 1)], 0);
    return c.innerHTML.indexOf('<script>') < 0;
  })());

if (failures) {
  console.error('\nFAIL: ' + failures + ' calltree assertion(s) failed');
  process.exit(1);
}
console.log('PASS');
