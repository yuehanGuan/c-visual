package dev.cppviz;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Orchestrates one visualization run: compile, trace, store.
 *
 * <p>Runs are serialized ({@code synchronized}) because a single local user is
 * assumed and lldb is heavy; concurrency here would only add failure modes.
 */
public final class RunService {

    private static final int RUN_TIMEOUT_SECONDS = 30;
    private static final int COMPILE_TIMEOUT_MS = 10_000;
    private static final int KEEP_RUNS = 30;
    private static final int MAX_PROGRAM_OUTPUT = 4096;

    private final CompileService compiler = new CompileService();
    private final TraceEngine engine;
    private final Path runsRoot;
    private final Object lock = new Object();

    public RunService(Path tracerScript) throws IOException {
        this.engine = new LldbEngine(tracerScript);
        this.runsRoot = Path.of(System.getProperty("user.home"), ".cppviz", "runs");
        Files.createDirectories(runsRoot);
    }

    public Map<String, Object> run(String code, String stdin, int maxSteps) {
        Map<String, Object> response = new LinkedHashMap<>();
        synchronized (lock) {
            String id = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            Path dir = runsRoot.resolve(id);
            Path trace = dir.resolve("trace.jsonl");
            try {
                Files.createDirectories(dir);

                CompileService.Result compiled = compiler.compile(code, dir);
                if (compiled.timedOut()) {
                    response.put("outcome", "compile_timeout");
                    response.put("ms", COMPILE_TIMEOUT_MS);
                    return response;
                }
                if (!compiled.ok()) {
                    response.put("outcome", "compile_error");
                    response.put("diags", diagMaps(compiled.diags()));
                    return response;
                }

                Path stdinFile = null;
                if (stdin != null && !stdin.isEmpty()) {
                    stdinFile = dir.resolve("stdin.txt");
                    Files.writeString(stdinFile, stdin, StandardCharsets.UTF_8);
                }

                TraceEngine.Result traced = engine.trace(
                        compiled.exe(), dir.resolve("main.cpp"), stdinFile,
                        trace, maxSteps, RUN_TIMEOUT_SECONDS);

                response.put("traceId", id);
                response.put("steps", traced.steps());
                response.put("programOutput", programOutput(dir));

                // Order matters: a truncated run is a *success* with a cut-off
                // trace, even though lldb reaped the process (exit -1).
                if ("error".equals(traced.reason())) {
                    response.put("outcome", "engine_error");
                    response.put("msg", traced.error());
                } else if ("crash".equals(traced.reason())) {
                    response.put("outcome", "crash");
                    response.put("exitCode", traced.exitCode());
                } else if ("truncated".equals(traced.reason())) {
                    response.put("outcome", "ok");
                    response.put("truncated", true);
                } else if (traced.timedOut()) {
                    response.put("outcome", "runtime_timeout");
                } else if (traced.exitCode() < 0) {
                    // Only a negative exit code means abnormal termination (killed by signal).
                    // A non-zero positive code is the program's own return value, not a crash.
                    response.put("outcome", "crash");
                    response.put("exitCode", traced.exitCode());
                } else {
                    response.put("outcome", "ok");
                    response.put("truncated", false);
                }
            } catch (Exception failure) {
                response.clear();
                response.put("outcome", "engine_error");
                response.put("msg", String.valueOf(failure));
            } finally {
                writeMeta(dir, response, code);
                pruneOldRuns();
            }
        }
        return response;
    }

    /** Path of a stored trace, or null when the id is unknown or malformed. */
    public Path traceFile(String id) {
        if (id == null || !id.matches("[0-9a-f]{8}")) {
            return null;
        }
        Path candidate = runsRoot.resolve(id).resolve("trace.jsonl");
        return Files.isRegularFile(candidate) ? candidate : null;
    }

    private static List<Map<String, Object>> diagMaps(List<CompileService.Diag> diags) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CompileService.Diag diag : diags) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("line", diag.line());
            item.put("col", diag.col());
            item.put("severity", diag.severity());
            item.put("message", diag.message());
            out.add(item);
        }
        return out;
    }

    private static String programOutput(Path dir) {
        Path file = dir.resolve("trace.jsonl.program.txt");
        try {
            if (!Files.isRegularFile(file)) {
                return "";
            }
            String text = Files.readString(file, StandardCharsets.UTF_8);
            return text.length() > MAX_PROGRAM_OUTPUT ? text.substring(0, MAX_PROGRAM_OUTPUT) : text;
        } catch (IOException ignored) {
            return "";
        }
    }

    /** Tiny key=value sidecar so the history list needs no JSON parser. */
    private void writeMeta(Path dir, Map<String, Object> response, String code) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("created=").append(System.currentTimeMillis()).append('\n');
            sb.append("steps=").append(String.valueOf(response.getOrDefault("steps", -1))).append('\n');
            sb.append("outcome=").append(String.valueOf(response.getOrDefault("outcome", "unknown"))).append('\n');
            sb.append("truncated=").append(Boolean.TRUE.equals(response.get("truncated"))).append('\n');
            sb.append("lines=").append(code == null ? 0 : code.split("\n", -1).length).append('\n');
            Files.writeString(dir.resolve("meta.txt"), sb.toString(), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            // best-effort
        }
    }

    /** All stored runs, newest first.  Runs without a trace are flagged. */
    public List<Map<String, Object>> listRuns() {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Stream<Path> entries = Files.list(runsRoot)) {
            List<Path> dirs = entries.filter(Files::isDirectory)
                    .sorted(Comparator.comparingLong(RunService::lastModified).reversed())
                    .toList();
            for (Path dir : dirs) {
                Path trace = dir.resolve("trace.jsonl");
                Map<String, String> meta = readMeta(dir);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", dir.getFileName().toString());
                item.put("trace", Files.isRegularFile(trace));
                item.put("created", meta.containsKey("created")
                        ? Long.parseLong(meta.get("created")) : lastModified(dir));
                item.put("steps", meta.containsKey("steps") ? Integer.parseInt(meta.get("steps")) : -1);
                item.put("outcome", meta.getOrDefault("outcome", ""));
                item.put("truncated", "true".equals(meta.get("truncated")));
                item.put("lines", meta.containsKey("lines") ? Integer.parseInt(meta.get("lines")) : 0);
                item.put("preview", firstLine(dir.resolve("main.cpp")));
                out.add(item);
            }
        } catch (IOException | NumberFormatException ignored) {
            // best-effort
        }
        return out;
    }

    /** Code + captured stdout of one stored run, or null when unknown. */
    public Map<String, Object> runDetail(String id) {
        if (id == null || !id.matches("[0-9a-f]{8}")) {
            return null;
        }
        Path dir = runsRoot.resolve(id);
        if (!Files.isDirectory(dir)) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        try {
            out.put("code", Files.readString(dir.resolve("main.cpp"), StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            out.put("code", "");
        }
        out.put("programOutput", programOutput(dir));
        return out;
    }

    private static Map<String, String> readMeta(Path dir) {
        Map<String, String> meta = new LinkedHashMap<>();
        try {
            for (String line : Files.readAllLines(dir.resolve("meta.txt"), StandardCharsets.UTF_8)) {
                int eq = line.indexOf('=');
                if (eq > 0) {
                    meta.put(line.substring(0, eq), line.substring(eq + 1));
                }
            }
        } catch (IOException ignored) {
            // no meta.txt (older run)
        }
        return meta;
    }

    private static String firstLine(Path file) {
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty()) {
                    return trimmed.length() > 80 ? trimmed.substring(0, 80) : trimmed;
                }
            }
        } catch (IOException ignored) {
            // best-effort
        }
        return "";
    }

    /** Delete every stored run; returns how many directories were removed. */
    public Map<String, Object> clearRuns() {
        int removed = 0;
        synchronized (lock) {
            try (Stream<Path> entries = Files.list(runsRoot)) {
                for (Path dir : entries.filter(Files::isDirectory).toList()) {
                    deleteRecursively(dir);
                    if (Files.notExists(dir)) {
                        removed++;
                    }
                }
            } catch (IOException ignored) {
                // best-effort: the response still reports what was removed
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cleared", removed);
        return out;
    }

    private void pruneOldRuns() {
        try (Stream<Path> entries = Files.list(runsRoot)) {
            List<Path> dirs = entries.filter(Files::isDirectory)
                    .sorted(Comparator.comparingLong(RunService::lastModified).reversed())
                    .toList();
            for (int i = KEEP_RUNS; i < dirs.size(); i++) {
                deleteRecursively(dirs.get(i));
            }
        } catch (IOException ignored) {
            // pruning is best-effort
        }
    }

    private static long lastModified(Path dir) {
        try {
            return Files.getLastModifiedTime(dir).toMillis();
        } catch (IOException ignored) {
            return 0L;
        }
    }

    private static void deleteRecursively(Path dir) {
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // best-effort
                }
            });
        } catch (IOException ignored) {
            // best-effort
        }
    }

    public String engineName() {
        return engine.name();
    }
}
