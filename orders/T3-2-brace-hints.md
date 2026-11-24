【T-3.2】`}` 行提示映射到所属语句（改 3 个文件：editor.js、新测试、smoke.sh）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只改这三个文件；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh**；只允许最后 `node --check` 与 `bash -n`。
✅ 下面所有代码已用 Node 跑过 10 组用例（字符串、注释、`} else {`、孤行 `{`、struct、单行块），照抄。

## 目标
播放视图里，一行只有 `}` 时现在统一显示「作用域结束 / 循环迭代」；改为显示它
闭合的是哪个块、开在第几行，例如：`← for 循环（第 6 行）`、`← 函数 main（第 3 行）`。

## 第 1 次调用：read 三个片段
- `src/main/resources/web/editor.js` 第 68–84 行（`renderPlayView`）
- 同文件第 132–146 行（`return {` 导出块）
- `smoke.sh` 第 45–51 行（T2.10 单元测试那段）

## 第 2 次调用：edit #1 —— 在 `  function renderPlayView(text) {` 之前插入 `codeOnly`
```
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

```
（保持与下一行 `  function renderPlayView` 之间的一个空行）

## 第 3 次调用：edit #2 —— 仍在 `renderPlayView` 之前插入 `blockOwner`
```
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

```

## 第 4 次调用：edit #3 —— 仍在 `renderPlayView` 之前插入 `describeBraces`
```
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

```

## 第 5 次调用：edit #4 —— 替换 `renderPlayView` 里的提示逻辑
原文（第 68–78 行）：
```
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
```
改为：
```
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
```

## 第 6 次调用：edit #5 —— 导出 `describeBraces`（供测试用）
原文：
```
  return {
    init,
    setMode,
```
改为：
```
  return {
    init,
    describeBraces,
    setMode,
```

## 第 7 次调用：新建 `tests/brace_hint_test.js`（整文件，逐行照抄）
```
#!/usr/bin/env node
/* brace_hint_test.js — editor.js 的 `}` 归属提示（describeBraces）单元测试。 */
'use strict';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'editor.js'), 'utf8');
const CppEditor = new Function(src + '\n;return CppEditor;')();

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('   ok  ' + name);
  else { failures += 1; console.error('   FAIL ' + name + (detail ? ' — ' + detail : '')); }
};
const hints = (text) => CppEditor.describeBraces(text.split('\n'));

let h = hints('int main() {\n    for (int i = 0; i < 3; i++) {\n        f();\n    }\n}');
check('for 循环归属', h[4] === '← for 循环（第 2 行）', JSON.stringify(h));
check('函数体归属', h[5] === '← 函数 main（第 1 行）', JSON.stringify(h));

h = hints('if (x) {\n    a();\n} else {\n    b();\n}');
check('else 分支归属', h[5] === '← else 分支（第 3 行）', JSON.stringify(h));
check('} else { 行本身不提示', h[3] === undefined, JSON.stringify(h));

h = hints('int main() {\n    printf("}");\n    // }\n    if (x) {\n        f();\n    }\n}');
check('字符串/注释里的 } 不计数', h[6] === '← if 分支（第 4 行）' && h[7] === '← 函数 main（第 1 行）', JSON.stringify(h));

h = hints('int main() {\n    /* { }\n    } */\n    return 0;\n}');
check('跨行块注释', h[5] === '← 函数 main（第 1 行）', JSON.stringify(h));

h = hints('int main()\n{\n    return 0;\n}');
check('孤行 { 归到上一行签名', h[4] === '← 函数 main（第 1 行）', JSON.stringify(h));

h = hints('struct Node {\n    int v;\n};');
check('struct 归属', h[3] === '← struct Node（第 1 行）', JSON.stringify(h));

h = hints('int main() { if (x) { return 1; } return 0; }');
check('单行块不产生提示', Object.keys(h).length === 0, JSON.stringify(h));
check('未闭合 } 不崩溃', JSON.stringify(hints('}\n}')) === '{}');

if (failures) { console.error('FAIL (' + failures + ')'); process.exit(1); }
console.log('PASS');
```

## 第 8 次调用：edit #6 —— smoke.sh 加一步（在 `pass "call tree logic ok"` 之后）
原文：
```
pass "call tree logic ok"

echo "== T0.4 lldb tracer =="
```
改为：
```
pass "call tree logic ok"

echo "== T3.2 brace hints (no lldb) =="
node tests/brace_hint_test.js > out/brace_hint_test.log 2>&1 || {
  cat out/brace_hint_test.log >&2
  fail "brace hint test failed"
}
pass "brace hints map to the owning line"

echo "== T0.4 lldb tracer =="
```

## 第 9 次调用：检查（只允许这三条，别跑别的）
```
node --check src/main/resources/web/editor.js    → 无输出、退出码 0
node --check tests/brace_hint_test.js            → 无输出、退出码 0
bash -n smoke.sh                                 → 无输出、退出码 0
```

## 收工
总结 ≤3 行：改了哪几处、三条检查的结果。不要写别的。
