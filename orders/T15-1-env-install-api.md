【T-15.1】一键安装引导：后端（改 EnvService.java + Main.java，共 2 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `EnvService.java` 末尾、`Main.java` 的 `/api/env` 路由；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 目标
`POST /api/env/install` → 尽力调起系统安装：
- macOS：执行 `/usr/bin/xcode-select --install`（弹出系统安装窗口），返回 `{ok, message, url}`
- Windows：返回 `{ok:false, message:"...", url:"https://github.com/llvm/llvm-project/releases/latest"}`（前端打开链接）
- 其他：返回提示

## 第 1 次调用：edit #1 —— EnvService 末尾加 `install()`
在 `probe` 方法之后（类结束的 `}` 之前）加：
```
    /** Best-effort guided install: opens the platform's own installer. */
    public Map<String, Object> install() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("url", "");
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("mac")) {
            Process process = null;
            try {
                process = new ProcessBuilder("/usr/bin/xcode-select", "--install")
                        .redirectErrorStream(true).start();
                if (!process.waitFor(15, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    out.put("message", "系统没有弹出安装窗口，请在终端手动运行：xcode-select --install");
                    return out;
                }
                String text = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
                boolean ok = process.exitValue() == 0;
                out.put("ok", ok);
                out.put("message", text.isEmpty()
                        ? (ok ? "已调起系统安装窗口，按提示完成即可" : "请在终端手动运行：xcode-select --install")
                        : text);
            } catch (IOException failure) {
                out.put("message", "无法运行 xcode-select：" + failure.getMessage());
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                out.put("message", "被中断");
            } finally {
                if (process != null && process.isAlive()) {
                    process.destroyForcibly();
                }
            }
        } else if (os.contains("win")) {
            out.put("url", "https://github.com/llvm/llvm-project/releases/latest");
            out.put("message", "请下载 LLVM（Windows installer），安装时勾选把 LLVM 加入 PATH");
        } else {
            out.put("message", "请用系统包管理器安装 clang 和 lldb");
        }
        return out;
    }
```

## 第 2 次调用：edit #2 —— Main 路由（放在 `/api/env` 路由之后）
```
            if ("/api/env/install".equals(path)
                    && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(env.install()));
                return;
            }
```

## 第 3 次调用：检查
```
./build.sh        → 期望 build ok
grep -n "install()\|/api/env/install" src/main/java/dev/cppviz/EnvService.java src/main/java/dev/cppviz/Main.java
```

## 收工
总结 ≤1 行：是否完成。不要写别的。
