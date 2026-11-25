【P-1a】tracer 随包走（改 Main.java + build.sh，共 2 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `Main.java` 的 `resolveTracer()` 与 import、`build.sh` 末尾；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 背景
`resolveTracer()` 只看 `tracer/tracer.py`（相对 CWD），打包成 .app/.msi 后 CWD 不确定 → 找不到。
方案：`build.sh` 把 tracer 也拷进 classes（即打进 jar），`resolveTracer()` 在找不到文件时
从 classpath `/tracer.py` 解到 `~/.cppviz/tracer.py` 再用。

## 第 1 次调用：read `Main.java` 的 import 段与 `resolveTracer()`；`build.sh` 末尾两行

## 第 2 次调用：edit #1 —— build.sh 末尾
原文：
```
cp -R src/main/resources/. out/classes/

echo "build ok"
```
改为：
```
cp -R src/main/resources/. out/classes/
# The tracer ships inside the jar so the packaged app can extract it at runtime.
cp tracer/tracer.py out/classes/tracer.py

echo "build ok"
```

## 第 3 次调用：edit #2 —— Main.java：`resolveTracer()` 加资源回退
原文：
```
    private static Path resolveTracer() {
        String fromEnv = System.getenv("VIZ_TRACER");
        Path candidate = fromEnv != null && !fromEnv.isBlank()
                ? Path.of(fromEnv)
                : Path.of("tracer", "tracer.py");
        if (!Files.isRegularFile(candidate)) {
            System.err.println("找不到 tracer 脚本：" + candidate.toAbsolutePath());
            System.err.println("请从项目根目录启动，或设置环境变量 VIZ_TRACER");
            System.exit(2);
        }
        return candidate.toAbsolutePath();
    }
```
改为：
```
    private static Path resolveTracer() {
        String fromEnv = System.getenv("VIZ_TRACER");
        if (fromEnv != null && !fromEnv.isBlank()) {
            Path candidate = Path.of(fromEnv);
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath();
            }
        }
        Path local = Path.of("tracer", "tracer.py");
        if (Files.isRegularFile(local)) {
            return local.toAbsolutePath();
        }
        // Packaged app: the tracer is inside the jar.  Extract it next to the
        // runs so a read-only install location still works.
        try (InputStream in = Main.class.getResourceAsStream("/tracer.py")) {
            if (in != null) {
                Path dir = Path.of(System.getProperty("user.home"), ".cppviz");
                Files.createDirectories(dir);
                Path target = dir.resolve("tracer.py");
                Files.copy(in, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                return target;
            }
        } catch (IOException ignored) {
            // fall through to the error message
        }
        System.err.println("找不到 tracer 脚本：tracer/tracer.py（或 jar 内 /tracer.py）");
        System.err.println("请从项目根目录启动，或设置环境变量 VIZ_TRACER");
        System.exit(2);
        return null;
    }
```
（`InputStream` 的 import 若没有就补 `import java.io.InputStream;`；`IOException` 若没有就补 `import java.io.IOException;`）

## 第 4 次调用：检查（只允许这两条）
```
./build.sh        → 期望 build ok
ls out/classes/tracer.py → 应存在
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
