package dev.cppviz;

import java.nio.file.Path;

/** Records program execution into a JSONL trace file. */
public interface TraceEngine {

    /**
     * @param steps      executed source lines
     * @param reason     {@code ok} | {@code truncated} | {@code error}
     * @param timedOut   the engine hit its own wall-clock limit
     * @param exitCode   the traced program's exit status, if known
     * @param error      engine-side failure message, or null
     */
    record Result(int steps, String reason, boolean timedOut, int exitCode, String error) {
    }

    String name();

    Result trace(Path exe, Path source, Path stdinFile, Path traceOut,
                 int maxSteps, int timeoutSeconds) throws Exception;
}
