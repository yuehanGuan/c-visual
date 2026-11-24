【P4-A】循环折叠：周期检测 + 按段导航（改 app.js + index.html）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 每次工具调用 ≤35 行；总结 ≤3 行。

## 为什么不能用"连续同行走一步"
`for` 行和循环体行是**交替**命中的，永远没有连续相同的行，所以那样折叠等于没折。
必须做**周期检测**：识别出重复的行序列，把它折叠成一个"循环段"。

## 第 1 步 · app.js：`buildSegments(steps)`（约 35 行）
伪代码（按这个实现，不要自创）：

```
segs = []; i = 0
while i < steps.length:
    best = null
    for p in 1..8:                       // 周期长度
        reps = 1
        while i + (reps+1)*p <= steps.length:
            ok = true
            for k in 0..p-1:
                if steps[i + reps*p + k].line != steps[i + k].line: ok = false; break
            if !ok break
            reps++
        covered = reps * p
        if reps >= 3 && covered >= 6 && (best == null || covered > best.covered):
            best = {p, reps, covered}
    if best:
        segs.push({from: i, to: i + best.covered - 1, count: best.covered,
                   period: best.p, reps: best.reps, folded: true})
        i += best.covered
    else:
        segs.push({from: i, to: i, count: 1, folded: false})
        i += 1
```

## 第 2 步 · app.js：用段导航
- `loadTrace` 之后计算 `state.segments = buildSegments(state.steps)`
- 新增 `state.segIdx`（段下标），默认 0
- `next()` / `prev()` 改成**按段移动**：
  - `next`：`segIdx+1`，但进段时用 `seg.from`（第一次进入）→ 段内再按 next 时在段内前进一格，
    走到 `seg.to` 才跳到下一段
  - 简化实现：维护 `state.idx`（原始步下标）不变，`next` 时若当前步是某个折叠段的**最后一步**，
    直接跳到下一段的 `from`；否则 `idx+1`
- `goTo(idx)` 不变
- 计数器文案改成：普通步显示 `第 N / M 步`；处在折叠段内时显示
  `循环 第 L 行 × R 次（本步 n/C）`

## 第 3 步 · index.html：加一个开关按钮（约 3 行）
在 `#editBtn` 旁边加 `<button id="foldBtn" class="ghost">折叠：开</button>`。
app.js 里绑定：点击切换 `state.folded`，文案在「折叠：开 / 折叠：关」之间变；
关掉时 `next/prev` 恢复逐行走（即忽略段，直接 idx±1）。

## 自测（必须量出数字）
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
用页面跑这段（300 次循环）：
```
#include <cstdio>
int main() {
    int s = 0;
    for (int i = 0; i < 300; i++) {
        s += i;
    }
    printf("%d\n", s);
    return 0;
}
```
用无头浏览器 + CDP 读 `state.steps.length` 与 `buildSegments(...)` 的结果长度
（或临时在页面 console 里算），要求：
- 原始步数 ≥ 600
- 折叠后段数 ≤ 20
- 关掉折叠后能逐行走

总结里必须写出这两个数字：`steps=???  segments=???`。

## 收工
DEVLOG.md §7 顶部加 2 行；总结 3 行（含上面两个数字）。
