【T-5.2】vector 堆块箭头压住最后一个格子（只改 memory.js，1 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderHeap` 末尾（`anchors.push` 那行）；不读别的文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测）
`vector<int>` 的堆块箭头终点原本是「最后一格的右边缘」，9px 的箭头尖压在格子文字上：
`10` 显示成 `1`、`20` 显示成 `2`。修法：终点右移 14px（留出箭头长度），并夹在画布内。

## 第 1 次调用：read `renderHeap` 里 `blocks.forEach` 的最后几行（`anchors.push` 附近）

## 第 2 次调用：edit —— 只改锚点那一行
原文：
```
      anchors.push({ addr: b.addr, x: 16 + cells.width, y: by + 20 + 26, from: false });
```
改为：
```
      /* Stop the arrow just right of the last cell: the arrowhead used to
       * cover the final value (a 40px cell showing "20" looked like "2"). */
      const tipX = Math.min(width - 12, 16 + cells.width + 14);
      anchors.push({ addr: b.addr, x: tipX, y: by + 20 + 26, from: false });
```

## 第 3 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
