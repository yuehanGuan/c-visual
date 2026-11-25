【P-6】Windows 真机修复：lldb 输出重定向、CRT 全局噪声、崩溃识别、工具链定位

工作目录：`F:\c-visual-src`（Windows 真机；源码来自 GitHub，**不要参考任何反编译产物**）

## 环境（已就绪）
- LLVM 23.1.6：`C:\Program Files\LLVM\bin\clang++.exe`、`...\lldb.exe`
- JDK 21.0.13（含 jpackage）：`F:\jdk21\jdk-21.0.13.1+2`
- Python 3.10（`python310.dll` 已在 PATH，官方 Windows 版 lldb 启动需要它）

## 一、先从源码复现（只读，不改）

用 `F:\c-visual-src\tools\verify-win.ps1` 在**当前源码**上跑一次基线：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File F:\c-visual-src\tools\verify-win.ps1
```

会看到 `/api/run` 全部 `steps=0`、`trace.jsonl` 0 字节（编译成功但一条追踪记录都没有）。

再看 `LldbEngine.java:52-59` 拼的那条命令，其中这一行是关键：

```java
"-o", "settings set target.output-path \"" + programOut + "\"",
```

手工用**带空格的路径**跑同一形式（`%USERPROFILE%` = `C:\Users\George Guan`，`.cppviz\runs\...` 天然带空格）：

```
lldb -b -o "settings set target.output-path \"F:\win test\trace.jsonl.program.txt\"" ... -- a.exe
→ error: 'test\trace.jsonl.program.txt' does not exist      （0 条 VIZ 记录，整批 -o 中止）
```

同一路径**不加引号**：

```
lldb -b -o "settings set target.output-path F:\win test\trace.jsonl.program.txt" ... -- a.exe
→ 正常输出 3 条 VIZ 记录，program.txt 也被创建
```

结论（Windows lldb 的命令行解析行为，不是猜测）：
- `settings set target.output-path` 的**值不能加引号**（加引号会被按空格切碎）；
- `command script import "路径"` 的**路径必须加引号**（不加会 `invalid pathname`）；
- 两者要求相反，所以必须分别处理。

## 二、任务清单

### 任务 1：新建 `src/main/java/dev/cppviz/Toolchain.java`

整文件复制（新代码，非反编译产物）：

```powershell
Copy-Item 'C:\Users\George Guan\Documents\deepseek-harness\default-workspace\cvis\Toolchain.java' `
          'F:\c-visual-src\src\main\java\dev\cppviz\Toolchain.java' -Force
```

它提供 `compiler()` / `lldb()`（`CPVIZ_COMPILER`/`CPVIZ_LLDB` → PATH → 常见安装目录，Windows 自动补 `.exe`）、
`commandPath(Path)`（反斜杠转正斜杠）、`applyEnv(Map)`（把 lldb 目录与 `python310.dll` 目录注入子进程 PATH）、
`compilerHint()` / `lldbHint()`。

### 任务 2：`CompileService.java`（第 33-44 行那一块）

1. 编译命令首项改成：

```java
        String compiler = Toolchain.compiler();
        if (compiler == null) {
            return new Result(false, null,
                    List.of(new Diag(0, 0, "error", Toolchain.compilerHint())), false, "");
        }
        List<String> cmd = List.of(
                compiler, "-std=c++17", "-g", "-O0", "-fno-omit-frame-pointer",
                "-Wall", "-Wextra",
                src.toString(), "-o", exe.toString());
```

2. `builder.environment().put("LC_ALL", "C");` 之后加 `Toolchain.applyEnv(builder.environment());`

3. 把 `Process process = builder.start();` 改成带兜底：

```java
        Process process;
        try {
            process = builder.start();
        } catch (IOException failure) {
            return new Result(false, null,
                    List.of(new Diag(0, 0, "error", Toolchain.compilerHint())), false,
                    String.valueOf(failure.getMessage()));
        }
```

### 任务 3：`LldbEngine.java`

1. 在 `Path programOut = ...` 之后取解释器：

```java
        String lldb = Toolchain.lldb();
        if (lldb == null) {
            return new Result(0, "error", false, -1, Toolchain.lldbHint());
        }
```

2. 命令改成（注意 output-path **没有引号**、import **有引号**、路径都走 `commandPath`）：

```java
        List<String> cmd = List.of(
                lldb, "-b",
                "-o", "settings set target.output-path " + Toolchain.commandPath(programOut),
                "-o", "command script import \"" + Toolchain.commandPath(tracerScript) + "\"",
                "-o", "script import tracer; tracer.bootstrap()",
                "-o", "run",
                "-o", "script import tracer; tracer.finish()",
                "--", exe.toString());
```

3. `builder.environment().put("LC_ALL", "C");` 之后加 `Toolchain.applyEnv(builder.environment());`

4. 崩溃识别补 Windows SEH（现在只认 `EXC_*` / `SIG*`；Windows 上是
   `stop reason = Exception 0xc0000005 encountered at address ...: Access violation`）：

```java
                || text.contains("0xc0000005")   // 越界 / 空指针
                || text.contains("0xc000001d")   // 非法指令
                || text.contains("0xc0000094")   // 整数除零
                || text.contains("0xc0000096")   // 特权指令
                || text.contains("0xc00000fd")   // 栈溢出
                || text.contains("0xc0000374")   // 堆破坏
                || text.contains("0xc0000409");  // 栈缓冲溢出
```

5. 冷启动保护：常量区加 `private static final long FIRST_RECORD_TIMEOUT_MS = 20_000;`；
   `trace()` 里加 `AtomicBoolean sawRecord = new AtomicBoolean(false);`，读到第一条 `VIZ ` 行时
   `sawRecord.set(true);`；看门狗判定改成
   `long budget = sawRecord.get() ? IDLE_TIMEOUT_MS : FIRST_RECORD_TIMEOUT_MS;`
   `boolean idle = now - lastActivity.get() > budget;`
   （`hardDeadline` 不动 —— 冷启动时 Defender 扫 lldb.exe 会超过 5 秒，曾把正常启动误判成 crash。）

### 任务 4：`EnvService.java`（保留现有 `install()`，只改 `check()` 和 `probe()`）

`check()` 改成：

```java
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
```

`probe()` 改成可变参数版本（返回值多一个 `output`）：

```java
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
```

记得补 `import java.util.ArrayList;` 和 `import java.util.List;`。
`install()` 里 Windows 那句提示改成：
`"请下载 LLVM（Windows installer），装完重开 c-visual 即可（不用手动加 PATH）；另外需要 Python 3.10 x64 —— 官方 Windows 版 lldb 要加载 python310.dll。"`

### 任务 5：`src/main/resources/web/app.js` 的 `checkEnv()`

在 `if (!envCache.lldb || !envCache.lldb.found) missing.push('lldb');` 之后加：

```js
    const pythonBroken = envCache.lldb && envCache.lldb.found
      && envCache.python && !envCache.python.found;
    if (pythonBroken) missing.push('lldb 的 Python 支持');
```

并把 `el.envText.textContent = ...` 那句改成：

```js
    el.envText.textContent = '缺少 ' + missing.join(' / ') + '，无法编译或调试 C++。'
      + (pythonBroken
        ? ' 需要 Python 3.10 x64（官方 Windows 版 lldb 要加载 python310.dll），装好后会自动检测。'
        : (mac ? ' 点「帮我安装」调起 Xcode 命令行工具安装。' : ' 点「帮我安装」打开 LLVM 下载页。'));
```

### 任务 6：`tracer/tracer.py` 去掉系统库全局变量

现象：Windows lldb 会把 ucrtbase 的全局（`$xdatasym`、`GS_ContextRecord`、`module_names`、
`errno_no_memory` …）当作帧变量返回，5 步就 200KB+。而且它对这些全局（**包括用户自己的 `g`**）
一律返回 `decl.IsValid()==False`，所以“按声明文件过滤”在 Windows 上不可用。

改法（只动 `_decl_in_src` 与 `_frame_vars` 两处）：

1. `_decl_in_src(value)` → `_decl_in_src(value, strict=False)`，两个“无法判定”的分支
   （`decl` 无效、`decl_file` 为空）从 `return True` 改成 `return not strict`。
2. 新增（放在 `_decl_in_src` 之前）：

```python
_src_names = None


def _name_in_src(value):
    """名字是否出现在用户源码里（Windows 上所有全局的 decl 都无效，只能靠名字区分）。"""
    global _src_names
    if _src_names is None:
        try:
            with open(_src, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read()
        except OSError:
            text = ""
        _src_names = set(re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*", text))
    raw = value.GetName() or ""
    return (raw[2:] if raw.startswith("::") else raw) in _src_names
```

3. `_frame_vars` 里把取值拆成两次：

```python
    try:
        # 参数/局部来自用户源码；全局/静态只有最内层帧取一次，且只认本文件里的。
        values = list(frame.GetVariables(True, True, False, True))
        globals_only = []
        if depth == 0:
            globals_only = list(frame.GetVariables(False, False, True, True))
            values.extend(globals_only)
    except Exception:
        return nodes
    strict_ids = {id(value) for value in globals_only}
```

4. 循环里 `if not _decl_in_src(value):` 改成：

```python
        if "$" in name:            # lldb 合成变量，如 $xdatasym
            continue
        if not _decl_in_src(value, strict=id(value) in strict_ids):
            continue
```

## 三、验收（必须自己跑，贴原文）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File F:\c-visual-src\tools\verify-win.ps1
```

期望：

```
CASE basic: outcome=ok steps>=3 traceBytes>100 bytesPerStep<=4000 out 含 20
CASE global: '"name": "g"' 在 trace 里；xdatasym|GS_ContextRecord|module_names|errno_no_memory 一个都没有
CASE crash: outcome=crash steps>=2
CASE env: compilerPath / lldbPath 非空，python=true
ALL PASS
```

## 四、禁止

- 不许参考/生成任何反编译产物；只读 `F:\c-visual-src` 里的源码
- 不改 `install()` 的 macOS 分支；不动 `out/`、`dist/`、`.github/`、`build.sh`、`package*.ps1|sh`
- 不做 git 操作；不改 README/DEVLOG
- `tools/verify-win.ps1` 只允许在"断言写错"时修断言，并在报告里说明改了什么

## 五、收工报告（≤12 行）

改动的文件清单 + `verify-win.ps1` 的 4 行 CASE 输出 + 最后一行结果。
