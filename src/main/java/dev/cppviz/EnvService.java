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