【T-12.1】历史运行后端：meta + 列表 + 详情（改 RunService.java + Main.java，共 4 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `RunService.java` 的 `run()`/`programOutput()`/`pruneOldRuns()`，`Main.java` 的 `handleApi`；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `./build.sh`。

## 目标
1. 每次运行结束在 run 目录写 `meta.txt`（纯 key=value，避免写 JSON 解析器）：
   `created / steps / outcome / truncated / lines`
2. `GET /api/runs` → `{"runs":[{id,created,steps,outcome,truncated,lines,trace,preview}]}`（按时间倒序）
3. `GET /api/runs/<id>` → `{id, code, programOutput}`
（`trace` 是 `trace.jsonl` 是否存在；`preview` 是 main.cpp 首个非空行、截 80 字符）

## 第 1 次调用：read 两段
- `RunService.java` 的 `run()` 末尾 `finally` 与 `programOutput()`、`lastModified()`
- `Main.java` 的 `handleApi`（`/api/run` 与 `/api/trace/` 两条路由之间）

## 第 2 次调用：edit #1 —— RunService：`run()` 的 finally 写 meta
原文：
```
            } finally {
                pruneOldRuns();
            }
```
改为：
```
            } finally {
                writeMeta(dir, response, code);
                pruneOldRuns();
            }
```

## 第 3 次调用：edit #2 —— RunService：新增方法（放在 `clearRuns()` 之前）
```
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

```

## 第 4 次调用：edit #3 —— Main：路由
在 `/api/trace/` 那段之前插入：
```
            if ("/api/runs".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8",
                        Json.write(Map.of("runs", runs.listRuns())));
                return;
            }
            if (path != null && path.startsWith("/api/runs/")
                    && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                Map<String, Object> detail = runs.runDetail(path.substring("/api/runs/".length()));
                if (detail == null) {
                    send(exchange, 404, "application/json; charset=utf-8", "{\"error\":\"no such run\"}");
                } else {
                    send(exchange, 200, "application/json; charset=utf-8", Json.write(detail));
                }
                return;
            }
```
（注意：`/api/runs/clear` 是 POST，已经在前面的 POST 路由里处理，不会被这里截走）

## 第 5 次调用：检查（只允许这两条）
```
./build.sh        → 期望 build ok
grep -n "listRuns\|runDetail\|writeMeta" src/main/java/dev/cppviz/RunService.java | head    → 各 1 处以上
```

## 收工
总结 ≤2 行：4 处是否完成、build 结果。不要写别的。
