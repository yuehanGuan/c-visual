【T-5.2c】堆块箭头的曲线起手方向（只改 memory.js，1 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `memory.js` 的 `renderArrows`；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 背景（实测）
堆块在行下方偏左，`dir = Math.sign(bx - ax) = -1`，于是控制点 `cx1 = ax - 16`：
曲线从行右边缘**先往左拐**，正好扫过地址文字 `0xcd0`。要改成"朝右出、从右侧进块"。

## 第 1 次调用：read `function renderArrows(anchors)` 全段

## 第 2 次调用：edit —— 只改控制点两行
原文：
```
      const dir = Math.sign(bx - ax) || 1;
      const cx1 = ax + dir * 16, cx2 = bx + dir * 16;
```
改为：
```
      /* Leave the row toward the right gutter and approach the block from its
       * right side, even when the block sits to the left of the row. */
      const cx1 = ax + 16, cx2 = bx + 16;
```

## 第 3 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/memory.js   → 无输出、退出码 0
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
