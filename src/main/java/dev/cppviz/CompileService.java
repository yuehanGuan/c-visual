package dev.cppviz;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Compiles user code with clang++ and turns diagnostics into structured data. */
public final class CompileService {

    public record Diag(int line, int col, String severity, String message) {
    }

    public record Result(boolean ok, Path exe, List<Diag> diags, boolean timedOut, String raw) {
    }

    private static final int TIMEOUT_SECONDS = 10;
    private static final Pattern DIAG_LINE =
            Pattern.compile("^(.*?):(\\d+):(\\d+): (error|warning|note): (.*)$");

    public Result compile(String source, Path work) throws IOException, InterruptedException {
        Path src = work.resolve("main.cpp");
        Files.writeString(src, source, StandardCharsets.UTF_8);
        boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        Path exe = work.resolve(windows ? "a.exe" : "a.out");

        String compiler = Toolchain.compiler();
        if (compiler == null) {
            return new Result(false, null,
                    List.of(new Diag(0, 0, "error", Toolchain.compilerHint())), false, "");
        }
        List<String> cmd = List.of(
                compiler, "-std=c++17", "-g", "-O0", "-fno-omit-frame-pointer",
                "-Wall", "-Wextra",
                src.toString(), "-o", exe.toString());

        ProcessBuilder builder = new ProcessBuilder(cmd)
                .directory(work.toFile())
                .redirectErrorStream(true);
        // Diagnostics are parsed with a regex, so keep them in a stable locale.
        builder.environment().put("LC_ALL", "C");
        Toolchain.applyEnv(builder.environment());

        Process process;
        try {
            process = builder.start();
        } catch (IOException failure) {
            return new Result(false, null,
                    List.of(new Diag(0, 0, "error", Toolchain.compilerHint())), false,
                    String.valueOf(failure.getMessage()));
        }
        AtomicBoolean killed = new AtomicBoolean(false);
        Thread watchdog = new Thread(() -> {
            try {
                if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                    killed.set(true);
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    process.destroyForcibly();
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }, "compile-watchdog");
        watchdog.setDaemon(true);
        watchdog.start();

        String output;
        try (var in = process.getInputStream()) {
            output = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        process.waitFor();

        if (killed.get()) {
            return new Result(false, null, List.of(), true, output);
        }
        if (process.exitValue() != 0 || !Files.exists(exe)) {
            return new Result(false, null, parse(output), false, output);
        }
        return new Result(true, exe, List.of(), false, output);
    }

    private static List<Diag> parse(String output) {
        List<Diag> diags = new ArrayList<>();
        for (String line : output.split("\n")) {
            Matcher matcher = DIAG_LINE.matcher(line);
            if (!matcher.matches()) {
                continue;
            }
            try {
                diags.add(new Diag(
                        Integer.parseInt(matcher.group(2)),
                        Integer.parseInt(matcher.group(3)),
                        matcher.group(4),
                        matcher.group(5).trim()));
            } catch (NumberFormatException ignored) {
                // keep going; a malformed line must not hide the others
            }
        }
        if (diags.isEmpty() && !output.isBlank()) {
            diags.add(new Diag(0, 0, "error", output.strip()));
        }
        return diags;
    }
}
