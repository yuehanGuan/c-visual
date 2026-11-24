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
