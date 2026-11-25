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
}