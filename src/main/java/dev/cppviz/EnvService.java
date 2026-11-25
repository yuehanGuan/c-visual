package dev.cppviz;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Probes the local C++ toolchain so the UI can explain what is missing. */
public final class EnvService {

    public Map<String, Object> check() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("os", System.getProperty("os.name"));
        out.put("java", System.getProperty("java.version"));

        String compiler = Toolchain.compiler();
        String lldb = Toolchain.lldb();
        out.put("compilerPath", compiler == null ? "" : compiler);
        out.put("lldbPath", lldb == null ? "" : lldb);
        out.put("clang", probe(compiler == null ? "clang++" : compiler, "--version"));
        out.put("lldb", probe(lldb == null ? "lldb" : lldb, "--version"));

        boolean pythonOk = false;
        if (lldb != null) {
            Map<String, Object> python = probe(lldb, "-b", "-o", "script print(1)", "-o", "quit");
            pythonOk = String.valueOf(python.get("output"))
                    .lines().anyMatch(line -> line.trim().equals("1"));
        }
        Map<String, Object> python = new LinkedHashMap<>();
        python.put("found", pythonOk);
        out.put("python", python);
        out.put("hint", pythonOk ? "" : lldbHint(compiler, lldb));
        return out;
    }

    private static String lldbHint(String compiler, String lldb) {
        if (compiler == null) {
            return Toolchain.compilerHint();
        }
        if (lldb == null) {
            return Toolchain.lldbHint();
        }
        return "lldb 找到了，但它的 Python 脚本接口没跑起来（官方 Windows 版需要 python310.dll）。"
                + "安装 Python 3.10 x64 并勾选 Add python.exe to PATH，"
                + "或把 3.10 的 embeddable 包解压到 lldb.exe 同目录，然后重启 c-visual。";
    }

    private Map<String, Object> probe(String command, String... extra) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", false);
        out.put("version", "");
        out.put("output", "");
        List<String> cmd = new ArrayList<>();
        cmd.add(command);
        for (String item : extra) {
            cmd.add(item);
        }
        Process process = null;
        try {
            process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return out;
            }
            String text = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String first = text.lines().findFirst().orElse("").trim();
            out.put("found", process.exitValue() == 0);
            out.put("version", first.length() > 120 ? first.substring(0, 120) : first);
            out.put("output", text.length() > 400 ? text.substring(0, 400) : text);
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
            out.put("message", "请下载 LLVM（Windows installer），装完重开 c-visual 即可（不用手动加 PATH）；另外需要 Python 3.10 x64 —— 官方 Windows 版 lldb 要加载 python310.dll。");
        } else {
            out.put("message", "请用系统包管理器安装 clang 和 lldb");
        }
        return out;
    }
}