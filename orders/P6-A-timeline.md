【P6-A】变量轨迹图（新增 timeline.js + 接两个线）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤35 行；总结 ≤3 行。

## 目标
在右侧面板底部加一块"轨迹"：每个变量一条横向时间线，看得到它随步数的变化趋势。
`int s` 在累加循环里应该画出一条上升的折线。

## 第 1 步 · 新建 src/main/resources/web/timeline.js（约 50 行）
全局对象 `Timeline`，提供 `Timeline.render(container, steps, currentIdx)`：
- 从所有 step 的**最内层帧**（frames[0]）收集变量名，按出现顺序，最多取 6 个
- 每个变量取每一出现步的值（只取 frames[0] 里同名的 scalar/seq 节点）：
  - scalar 用 `value`
  - seq 用 `items.length`（画元素个数变化）
- 若该变量的所有取值都能 `Number()` 成功（且至少 2 个点）→ 画 **SVG 折线（sparkline）**
  - 宽 = 容器宽 - 90，高 22；把值域 min..max 线性映射到 y（max==min 时画水平线）
  - 当前步对应的点画一个圆点（`fill:#5ac8fa`）
- 否则 → 画**刻度条**：每一步一个小竖线，值相比上一步变了就高亮（`#f5b942`）
- 每行左侧写变量名（60px 宽，等宽字体，muted）
- 顶部一行小标题 `轨迹`
- 没有变量时显示 `<p class="empty">（无轨迹数据）</p>`

## 第 2 步 · index.html（2 处，约 4 行）
- 在 `memory.js` 之后加 `<script src="/timeline.js"></script>`
- 在 `#frames` 之后、`程序输出` 抬头之前，加 `<div id="timeline" class="timeline"></div>`

## 第 3 步 · app.js（约 4 行）
在 `goTo()` 里渲染完 memory 之后调用：`Timeline.render(document.getElementById('timeline'), state.steps, clamped)`。
`loadTrace` 里清空该容器。

## 第 4 步 · style.css（约 12 行）
```
.timeline { padding: 6px 12px 10px; border-top: 1px solid var(--line); max-height: 160px; overflow: auto; }
.timeline .tl-title { font: 12px var(--mono); color: var(--muted); margin-bottom: 4px; }
.timeline .tl-row { display: flex; align-items: center; gap: 8px; height: 24px; }
.timeline .tl-name { width: 60px; font: 11.5px var(--mono); color: #8b93a7; text-align: right; }
.timeline .tl-plot { flex: 1; }
```

## 自测（必须量出来）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
用这段代码跑，然后确认：
```
#include <cstdio>
int main() {
    int s = 0;
    for (int i = 0; i < 20; i++) {
        s += i;
    }
    printf("%d\n", s);
    return 0;
}
```
- `#timeline` 里出现 ≥2 行（s 和 i）
- `s` 那一行有一条 `<polyline>`（上升折线），不是刻度条
- 步进时圆点位置跟着移动

用 CDP 读 `document.querySelectorAll('#timeline .tl-row').length` 与
`s 那行的 polyline 点数`，写进总结。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（含行数与 polyline 点数）。
