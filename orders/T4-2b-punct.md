【T-4.2b】修 banner 拼接的标点（只改 app.js，1 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `app.js` 里 `function deepRecursionNote()` 这一段；不改别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check src/main/resources/web/app.js` 与 `./build.sh`。

## 背景
实测 banner 变成「…已保留最后的执行记录。；栈上至少有 64 层 deep(int)，…」，句号后多了个分号。

## 第 1 次调用：edit —— 只改返回的那一行
原文：
```
    return `；栈上至少有 ${frames.length} 层 ${fn}，看起来是递归太深 / 栈溢出`;
```
改为：
```
    return ` 栈上至少有 ${frames.length} 层 ${fn}，看起来是递归太深 / 栈溢出。`;
```

## 第 2 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                      → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
