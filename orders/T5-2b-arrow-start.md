【T-5.2b】堆块箭头的起点压在地址文字上（只改 memory.js，1 行）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderFrame` 里 `anchors.push({ addr: node.dataAddr, ...})` 那行。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测）
`v` 行的地址文字右端在 `x = cardW - 26`，而堆块箭头的起点也是 `x = cardW - 26`
→ 箭头（2.4px、圆头）直接从 `0xc00` 的最后一个字符上压过去。
把它起点移到卡片右边框上（`cardW - 14`），与文字留 12px。

## 第 1 次调用：edit —— 只改这一个 x
原文：
```
        anchors.push({ addr: node.dataAddr, x: cardW - 26, y: rowY + ROW_H / 2, from: true });
```
改为：
```
        /* Start on the card border: cardW - 26 is where the address text ends,
         * so the arrow used to draw straight across "0xc00". */
        anchors.push({ addr: node.dataAddr, x: cardW - 14, y: rowY + ROW_H / 2, from: true });
```

## 第 2 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
