package dev.cppviz;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Runs lldb with the Python tracer and forwards {@code VIZ } records to a file.
 *
 * <p>Two lldb behaviours drive the watchdog design:
 * <ul>
 *   <li>A crashing program makes lldb stall after the stop, so the driver's
 *       trailing {@code finish()} command never runs. Waiting for a fixed
 *       wall-clock budget would therefore burn the whole budget on every crash.</li>
 *   <li>A healthy program emits a record every few milliseconds.</li>
 * </ul>
 * So the watchdog is an <em>idle</em> timeout: no new record for
 * {@link #IDLE_TIMEOUT_MS} means the engine is stuck. The crash is then
 * recognised from lldb's own stop message in the captured output.
 */
public final class LldbEngine implements TraceEngine {

    private static final long IDLE_TIMEOUT_MS = 5_000;
    // Cold start: Defender scans lldb.exe on first launch, which used to
    // exceed IDLE_TIMEOUT_MS and turn a healthy start into a false crash.
    private static final long FIRST_RECORD_TIMEOUT_MS = 20_000;
    private static final int TAIL_LINES = 40;

    private final Path tracerScript;

    public LldbEngine(Path tracerScript) {
        this.tracerScript = tracerScript.toAbsolutePath();
    }

    @Override
    public String name() {
        return "lldb";
    }

    @Override
    public Result trace(Path exe, Path source, Path stdinFile, Path traceOut,
                        int maxSteps, int timeoutSeconds) throws Exception {
        Path programOut = traceOut.resolveSibling(traceOut.getFileName() + ".program.txt");

        String lldb = Toolchain.lldb();
        if (lldb == null) {
            return new Result(0, "error", false, -1, Toolchain.lldbHint());
        }

        List<String> cmd = List.of(
                lldb, "-b",
                "-o", "settings set target.output-path " + Toolchain.commandPath(programOut),
                "-o", "command script import \"" + Toolchain.commandPath(tracerScript) + "\"",
                "-o", "script import tracer; tracer.bootstrap()",
                "-o", "run",
                "-o", "script import tracer; tracer.finish()",
                "--", exe.toString());

        ProcessBuilder builder = new ProcessBuilder(cmd)
                .directory(exe.getParent().toFile())
                .redirectErrorStream(true);
        builder.environment().put("LC_ALL", "C");
        Toolchain.applyEnv(builder.environment());
        builder.environment().put("VIZ_SRC", source.toAbsolutePath().toString());
        builder.environment().put("VIZ_MAX_STEPS", String.valueOf(maxSteps));
        builder.environment().put("VIZ_OUT", programOut.toString());
        if (stdinFile != null) {
            builder.environment().put("VIZ_STDIN", stdinFile.toAbsolutePath().toString());
        }

        Process process = builder.start();
        AtomicLong lastActivity = new AtomicLong(System.currentTimeMillis());
        // Until the first VIZ record lands we are still paying lldb's cold start,
        // so the idle budget starts out much wider than the steady-state one.
        AtomicBoolean sawRecord = new AtomicBoolean(false);
        AtomicBoolean idleKilled = new AtomicBoolean(false);
        long hardDeadline = System.currentTimeMillis() + timeoutSeconds * 1000L;

        Thread watchdog = new Thread(() -> {
            while (process.isAlive()) {
                try {
                    Thread.sleep(120);
                } catch (InterruptedException interrupted) {
                    return;
                }
                long now = System.currentTimeMillis();
                long budget = sawRecord.get() ? IDLE_TIMEOUT_MS : FIRST_RECORD_TIMEOUT_MS;
                boolean idle = now - lastActivity.get() > budget;
                if (idle || now > hardDeadline) {
                    idleKilled.set(true);
                    killTree(process);
                    return;
                }
            }
        }, "trace-watchdog");
        watchdog.setDaemon(true);
        watchdog.start();

        int steps = 0;
        String reason = "ok";
        int exitCode = -1;
        String error = null;
        Deque<String> tail = new ArrayDeque<>();
        boolean crashSeen = false;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
             Writer out = Files.newBufferedWriter(traceOut, StandardCharsets.UTF_8)) {

            String line;
            while ((line = reader.readLine()) != null) {
                lastActivity.set(System.currentTimeMillis());

                if (!line.startsWith("VIZ ")) {
                    // Keep a short tail of lldb's own output: it is how a crash
                    // is told apart from a plain hang. React immediately when
                    // the stop reason is a fatal signal, instead of idling out.
                    tail.addLast(line);
                    if (tail.size() > TAIL_LINES) {
                        tail.removeFirst();
                    }
                    if (looksLikeCrash(line)) {
                        crashSeen = true;
                        killTree(process);
                        break;
                    }
                    continue;
                }

                String payload = line.substring(4);
                sawRecord.set(true);
                out.write(payload);
                out.write('\n');

                if (payload.contains("\"t\": \"step\"")) {
                    steps++;
                } else if (payload.contains("\"t\": \"end\"")) {
                    // Trust the record count over the engine's own tally.
                    int declared = intField(payload, "steps", steps);
                    steps = Math.max(steps, declared);
                    reason = textField(payload, "reason", reason);
                    exitCode = intField(payload, "exit", exitCode);
                    lastActivity.set(Long.MAX_VALUE / 2);
                } else if (payload.contains("\"t\": \"meta\"") && payload.contains("\"error\"")) {
                    error = payload;
                }
            }
        } finally {
            killTree(process);
            process.waitFor(2, TimeUnit.SECONDS);
        }

        if (crashSeen || looksLikeCrash(String.join("\n", tail))) {
            return new Result(steps, "crash", false, exitCode, null);
        }
        if (error != null) {
            return new Result(steps, "error", false, exitCode, error);
        }
        if (idleKilled.get()) {
            return new Result(steps, "timeout", true, exitCode, null);
        }
        return new Result(steps, reason, false, exitCode, null);
    }

    private static boolean looksLikeCrash(String text) {
        return text.contains("EXC_BAD_ACCESS")
                || text.contains("EXC_BAD_INSTRUCTION")
                || text.contains("EXC_ARITHMETIC")
                || text.contains("SIGSEGV")
                || text.contains("SIGBUS")
                || text.contains("SIGFPE")
                || text.contains("SIGABRT")
                || text.contains("0xc0000005")   // 越界 / 空指针
                || text.contains("0xc000001d")   // 非法指令
                || text.contains("0xc0000094")   // 整数除零
                || text.contains("0xc0000096")   // 特权指令
                || text.contains("0xc00000fd")   // 栈溢出
                || text.contains("0xc0000374")   // 堆破坏
                || text.contains("0xc0000409");  // 栈缓冲溢出
    }

    private static void killTree(Process process) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }

    private static int intField(String payload, String field, int fallback) {
        var matcher = java.util.regex.Pattern
                .compile("\"" + field + "\":\\s*(-?\\d+)").matcher(payload);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : fallback;
    }

    private static String textField(String payload, String field, String fallback) {
        var matcher = java.util.regex.Pattern
                .compile("\"" + field + "\":\\s*\"([^\"]*)\"").matcher(payload);
        return matcher.find() ? matcher.group(1) : fallback;
    }
}
