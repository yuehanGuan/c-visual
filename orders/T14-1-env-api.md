【T-14.1】环境自检 API（新建 EnvService.java + Main 路由，共 2 个文件）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `Main.java` 的字段区/路由区；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 目标
`GET /api/env` → `{os, java, clang:{found, version}, lldb:{found, version}}`
（`clang++ --version` / `lldb --version`，5 秒超时；找不到或非 0 退出 → found=false）

## 第 1 次调用：新建 src/main/java/dev/cppviz/EnvService.java（整文件照抄）
```
package dev.cppviz;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Probes the local C++ toolchain so the UI can explain what is missing. */
public final class EnvService {

    public Map<String, Object> check() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("os", System.getProperty("os.name"));
        out.put("java", System.getProperty("java.version"));
        out.put("clang", probe("clang++"));
        out.put("lldb", probe("lldb"));
        return out;
    }

    private Map<String, Object> probe(String command) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", false);
        out.put("version", "");
        Process process = null;
        try {
            process = new ProcessBuilder(command, "--version").redirectErrorStream(true).start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return out;
            }
            String text = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String first = text.lines().findFirst().orElse("").trim();
            out.put("found", process.exitValue() == 0);
            out.put("version", first.length() > 120 ? first.substring(0, 120) : first);
        } catch (IOException failure) {
            // not installed
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
            }
        }
        return out;
    }
}
```

## 第 2 次调用：Main.java 字段
原文：
```
    private final RunService runs;

    private Main(RunService runs) {
        this.runs = runs;
    }
```
改为：
```
    private final RunService runs;
    private final EnvService env = new EnvService();

    private Main(RunService runs) {
        this.runs = runs;
    }
```

## 第 3 次调用：Main.java 路由（放在 `/api/runs` 那段之前）
```
            if ("/api/env".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(env.check()));
                return;
            }
```

## 第 4 次调用：检查（只允许这两条）
```
./build.sh        → 期望 build ok
grep -n "EnvService\|/api/env" src/main/java/dev/cppviz/Main.java
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
