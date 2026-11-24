【T-3.8】更慢的播放速度 + 看得懂的单步按钮（改 2 个文件，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 的 footer 与 `style.css` 的 `.controls`；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 背景（用户反馈）
底部的 `◀` / `▶` 两个按钮和「播放」按钮长得太像，用户没看出是"单步"；
速度最慢只有 0.5×（900ms/步），看压栈动画（220ms）还是偏快。
目标：按钮直接写「上一步 / 下一步」；速度加一档 0.25×（1800ms/步）。

## 第 1 次调用：read 两段
- `index.html` 第 76–95 行（footer 控件与速度下拉）
- `style.css` 第 365–376 行（`.controls`）

## 第 2 次调用：edit #1 —— 按钮加文字
原文：
```
  <button id="prevBtn" title="上一步 (←)">◀</button>
  <button id="nextBtn" title="下一步 (→)">▶</button>
  <button id="playBtn" class="primary" title="播放/暂停 (空格)">播放</button>
```
改为：
```
  <button id="prevBtn" title="上一步 (←)">◀ 上一步</button>
  <button id="nextBtn" title="下一步 (→)">下一步 ▶</button>
  <button id="playBtn" class="primary" title="播放/暂停 (空格)">播放</button>
```

## 第 3 次调用：edit #2 —— 速度加 0.25×
原文：
```
      <option value="900">0.5×</option>
      <option value="450" selected>1×</option>
```
改为：
```
      <option value="1800">0.25×</option>
      <option value="900">0.5×</option>
      <option value="450" selected>1×</option>
```

## 第 4 次调用：edit #3 —— 按钮不换行（style.css）
在 `.controls #scrub { flex: 1; accent-color: var(--accent); }` 之后加一行：
```
.controls button { white-space: nowrap; }
```

## 第 5 次调用：检查（只允许这一条）
```
./build.sh     → 期望 build ok
```

## 收工
总结 ≤2 行：3 处是否完成、build 结果。不要写别的。
