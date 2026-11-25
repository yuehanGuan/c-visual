【P-1b】Windows 兼容：a.exe + lldb 路径加引号（改 CompileService.java + LldbEngine.java，共 2 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这两个文件的相关行；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 第 1 次调用：edit #1 —— CompileService：可执行文件名按平台
原文：
```
        Path exe = work.resolve("a.out");
```
改为：
```
        boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        Path exe = work.resolve(windows ? "a.exe" : "a.out");
```

## 第 2 次调用：edit #2 —— LldbEngine：`-o` 里的路径加引号（Windows 用户名带空格会炸）
原文：
```
                "-o", "settings set target.output-path " + programOut,
                "-o", "command script import " + tracerScript,
```
改为：
```
                "-o", "settings set target.output-path \"" + programOut + "\"",
                "-o", "command script import \"" + tracerScript + "\"",
```

## 第 3 次调用：检查（只允许这一条）
```
./build.sh     → 期望 build ok
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
