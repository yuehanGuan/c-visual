package dev.cppviz;

import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Locates the two external tools c-visual depends on: a C++ compiler and lldb.
 *
 * <p>On macOS both live in the Xcode command line tools, so hard-coding
 * {@code "clang++"} and {@code "lldb"} works.  On Windows neither is part of the
 * OS: {@code CreateProcess} reports error 2 and the run ends with the raw
 * {@code java.io.IOException} the user sees.  Resolving the tools here gives the
 * UI a message that says what to install instead.
 *
 * <p>Order: {@code CPVIZ_COMPILER}/{@code CPVIZ_LLDB} override, then PATH, then
 * well-known install dirs.  Everything is best effort and never throws.
 */
final class Toolchain {

    private static final boolean WINDOWS = System.getProperty("os.name", "")
            .toLowerCase(Locale.ROOT).contains("win");
    private static final String EXE = WINDOWS ? ".exe" : "";

    private Toolchain() {
    }

    /** Absolute path of the C++ compiler, or null when none can be found. */
    static String compiler() {
        return resolve(System.getenv("CPVIZ_COMPILER"), "clang++", "g++", "clang");
    }

    /** Absolute path of lldb, or null when none can be found. */
    static String lldb() {
        return resolve(System.getenv("CPVIZ_LLDB"), "lldb");
    }

    /** Path form that is safe to paste into an lldb {@code -o} command. */
    static String commandPath(Path path) {
        String text = path.toString();
        return WINDOWS ? text.replace('\\', '/') : text;
    }

    /**
     * Adds the dirs Windows needs but does not put on PATH for us: the LLVM bin
     * dir (lldb's own DLLs) and a Python 3.10 dir (lldb loads python310.dll at
     * startup; without it lldb silently prints nothing and the trace is empty).
     */
    static void applyEnv(Map<String, String> env) {
        if (!WINDOWS || env == null) {
            return;
        }
        Set<String> add = new LinkedHashSet<>();
        String lldb = lldb();
        if (lldb != null) {
            Path parent = Paths.get(lldb).getParent();
            if (parent != null) {
                add.add(parent.toString());
            }
        }
        Path python = pythonDir();
        if (python != null) {
            add.add(python.toString());
        }
        if (add.isEmpty()) {
            return;
        }
        String key = "PATH";
        for (String name : env.keySet()) {
            if ("path".equalsIgnoreCase(name)) {
                key = name;
                break;
            }
        }
        String path = env.getOrDefault(key, "");
        StringBuilder joined = new StringBuilder(path);
        for (String dir : add) {
            if (joined.indexOf(dir) >= 0) {
                continue;
            }
            if (joined.length() > 0) {
                joined.append(';');
            }
            joined.append(dir);
        }
        env.put(key, joined.toString());
    }

    static String compilerHint() {
        return "找不到 C++ 编译器（clang++ / g++）。\n"
                + "macOS 下 clang++ 由 Xcode 命令行工具自带，Windows 没有，需要自己装：\n"
                + "  1) winget install --id LLVM.LLVM -e\n"
                + "     或 https://github.com/llvm/llvm-project/releases 下载 LLVM-<版本>-win64.exe，\n"
                + "     安装时勾选 \"Add LLVM to the system PATH\"。\n"
                + "  2) 装完重开 c-visual（旧进程不会重新读 PATH）。\n"
                + "已有 MinGW g++ 的话也可以直接用：设置环境变量 CPVIZ_COMPILER=C:\\mingw64\\bin\\g++.exe。";
    }

    static String lldbHint() {
        return "找不到 lldb，追踪依赖它的 Python 脚本（tracer.py）。\n"
                + "Windows 请安装 LLVM（winget install --id LLVM.LLVM -e 或官方 win64 安装包），\n"
                + "并确认 lldb.exe 在 PATH 上。\n"
                + "注意：官方 Windows 版 lldb 启动时要加载 python310.dll，缺了它会\"什么都不输出\"，\n"
                + "请安装 Python 3.10 x64，或把 3.10 的 Windows embeddable 包解压到 lldb.exe 同一目录。\n"
                + "自检：lldb -b -o \"script print(1)\" -o quit   应打印 1。";
    }

    // ---------------------------------------------------------------- lookup

    private static String resolve(String override, String... names) {
        if (override != null && !override.isBlank()) {
            String trimmed = override.trim();
            Path direct = Paths.get(trimmed);
            String hit = executable(direct);
            if (hit != null) {
                return hit;
            }
            if (direct.getFileName() != null) {
                hit = onPath(direct.getFileName().toString());
                if (hit != null) {
                    return hit;
                }
            }
        }
        for (String name : names) {
            String hit = onPath(name);
            if (hit != null) {
                return hit;
            }
        }
        for (Path dir : searchDirs()) {
            for (String name : names) {
                String hit = executable(withExe(dir.resolve(name)));
                if (hit != null) {
                    return hit;
                }
            }
        }
        return null;
    }

    private static String onPath(String name) {
        String path = System.getenv("PATH");
        if (path == null || path.isBlank()) {
            return null;
        }
        for (String dir : path.split(java.io.File.pathSeparator)) {
            if (dir.isBlank()) {
                continue;
            }
            String hit = executable(withExe(Paths.get(dir).resolve(name)));
            if (hit != null) {
                return hit;
            }
        }
        return null;
    }

    /** Windows resolves clang++ -> clang++.exe inside CreateProcess; we do it by hand. */
    private static Path withExe(Path candidate) {
        if (!WINDOWS) {
            return candidate;
        }
        String file = candidate.getFileName() == null ? "" : candidate.getFileName().toString();
        if (file.contains(".")) {
            return candidate;
        }
        return candidate.resolveSibling(file + EXE);
    }

    private static String executable(Path candidate) {
        try {
            if (!Files.isRegularFile(candidate)) {
                return null;
            }
            if (!WINDOWS && !Files.isExecutable(candidate)) {
                return null;
            }
            return candidate.toAbsolutePath().toString();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static List<Path> searchDirs() {
        List<Path> dirs = new ArrayList<>();
        if (WINDOWS) {
            String programFiles = System.getenv("ProgramFiles");
            String programFilesX86 = System.getenv("ProgramFiles(x86)");
            String localAppData = System.getenv("LOCALAPPDATA");
            String userProfile = System.getenv("USERPROFILE");
            String programData = System.getenv("ProgramData");
            if (programFiles != null) {
                dirs.add(Paths.get(programFiles, "LLVM", "bin"));
            }
            if (programFilesX86 != null) {
                dirs.add(Paths.get(programFilesX86, "LLVM", "bin"));
            }
            if (localAppData != null) {
                dirs.add(Paths.get(localAppData, "Programs", "LLVM", "bin"));
            }
            if (programData != null) {
                dirs.add(Paths.get(programData, "chocolatey", "bin"));
            }
            if (userProfile != null) {
                dirs.add(Paths.get(userProfile, "scoop", "shims"));
            }
            dirs.add(Paths.get("C:\\mingw64\\bin"));
            dirs.add(Paths.get("C:\\mingw32\\bin"));
            dirs.add(Paths.get("C:\\x86_64-w64-mingw32\\bin"));
            dirs.add(Paths.get("C:\\msys64\\mingw64\\bin"));
            dirs.add(Paths.get("C:\\TDM-GCC-64\\bin"));
            // Visual Studio's bundled LLVM toolchain, if the component was installed.
            if (programFiles != null) {
                dirs.addAll(globDirs(Paths.get(programFiles, "Microsoft Visual Studio"), 4,
                        path -> path.endsWith(Paths.get("VC", "Tools", "Llvm", "x64", "bin"))));
            }
        } else {
            dirs.add(Paths.get("/opt/homebrew/bin"));
            dirs.add(Paths.get("/usr/local/bin"));
            dirs.add(Paths.get("/usr/bin"));
        }
        return dirs;
    }

    private static List<Path> globDirs(Path root, int depth, java.util.function.Predicate<Path> match) {
        List<Path> found = new ArrayList<>();
        walk(root, depth, match, found);
        return found;
    }

    private static void walk(Path dir, int depth, java.util.function.Predicate<Path> match, List<Path> out) {
        if (depth < 0 || out.size() > 8) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path child : stream) {
                if (!Files.isDirectory(child)) {
                    continue;
                }
                if (match.test(child)) {
                    out.add(child);
                } else {
                    walk(child, depth - 1, match, out);
                }
            }
        } catch (Exception ignored) {
            // unreadable / missing dir: just skip it
        }
    }

    /**
     * Dir holding python310.dll (or python3.dll), which lldb on Windows loads at
     * startup.  PATH first, then the usual per-user install location.
     */
    private static Path pythonDir() {
        String path = System.getenv("PATH");
        if (path != null) {
            for (String dir : path.split(";")) {
                if (!dir.isBlank() && (Files.isRegularFile(Paths.get(dir, "python310.dll"))
                        || Files.isRegularFile(Paths.get(dir, "python3.dll")))) {
                    return Paths.get(dir);
                }
            }
        }
        String localAppData = System.getenv("LOCALAPPDATA");
        String programFiles = System.getenv("ProgramFiles");
        List<Path> candidates = new ArrayList<>();
        if (localAppData != null) {
            candidates.add(Paths.get(localAppData, "Programs", "Python", "Python310"));
        }
        if (programFiles != null) {
            candidates.add(Paths.get(programFiles, "Python310"));
        }
        candidates.add(Paths.get("C:\\Python310"));
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate.resolve("python310.dll"))) {
                return candidate;
            }
        }
        return null;
    }
}
