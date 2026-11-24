【P5-A】diff 高亮升级：变化摘要 + 修帧对齐（改 memory.js + style.css）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤30 行；总结 ≤3 行。

## 目标
现在只有值变了才描边，但用户看不出"是哪一行导致的、从多少变到多少"。
要做两件事：

## 第 1 步 · 修帧对齐（memory.js，约 10 行）
现在 `renderFrames` 用**数组下标**对齐上一帧，递归压栈/出栈时会整片误判成"变化"（已知 B3）。
改成按"帧身份"对齐：帧的 key 用 `fn + "#" + depth`；找不到对应上一帧时，
该帧**不做任何 changed 标记**（宁可少标，不能乱标）。

## 第 2 步 · 变化摘要条（memory.js，约 25 行）
在渲染栈帧之前，先生成一个摘要 HTML 插入 `container` 顶部（class `mem-diff`）：
- 遍历最内层帧（depth 0）的变量，与上一帧同名变量比较**可比较的摘要值**
  （scalar 用 `value`；seq 用 `items.join(",")` + capacity；map/set 用 items 拼串；pair 用 first+second；
   其它用 `type`）
- 有变化的，生成一条：`<span class="diff-item">名字: 旧值 → 新值</span>`
- 旧值/新值超过 12 字符就截断加 `…`
- 最多列 3 条，多余的写 `+N`
- 没有任何变化时，整个摘要条不显示
- 摘要条下面留 6px 间距

## 第 3 步 · style.css（约 12 行）
```
.mem-diff { display:flex; flex-wrap:wrap; gap:6px; margin: 0 0 6px 12px; }
.mem-diff .diff-item {
  font: 11.5px var(--mono); color: #ffe6a7;
  background: rgba(245,185,66,.12); border:1px solid rgba(245,185,66,.4);
  border-radius: 4px; padding: 1px 6px;
}
.mem-diff .diff-more { font: 11px var(--mono); color: var(--muted); }
```

## 自测（必须量出来）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
用 40 次循环那段代码（`for(int i=0;i<40;i++) s+=i;`），在页面里：
1. 关掉折叠，走几步，确认顶部出现类似 `s: 15 → 21` 的摘要
2. 打开递归示例（fib）走到压栈处，确认**不会**整片误标 changed（摘要条最多 1 条）

用 CDP 读 `document.querySelectorAll('.mem-diff .diff-item').length` 与文本，写进总结。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（贴出摘要文本 + 递归时的条数）。
