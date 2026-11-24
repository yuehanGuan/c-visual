【T-3.4a】run 历史清空 API（只改 RunService.java + Main.java，共 2 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读这两个文件的相关片段；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb、不要跑 ./smoke.sh / ./run.sh**；允许 `./build.sh`（只编译，很快）。

## 目标
新增 `POST /api/runs/clear`：删掉 `~/.cppviz/runs/` 下所有历史目录，返回
`{"cleared": <实际删掉的目录数>}`。与 `run()` 共用同一把锁，避免清空时正好在跑。

## 第 1 次调用：read 两段
- `src/main/java/dev/cppviz/RunService.java` 第 100–120 行（`traceFile` 之后）与 140–175 行（`pruneOldRuns` 附近）
- `src/main/java/dev/cppviz/Main.java` 第 81–97 行（`handleApi` 的路由）

## 第 2 次调用：edit #1 —— RunService.java 在 `pruneOldRuns()` 之前插入
```
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

```
（插在 `private void pruneOldRuns() {` 这一行之前，保留一个空行）

## 第 3 次调用：edit #2 —— Main.java 路由（`/api/run` 那段之后）
原文：
```
            if (path != null && path.startsWith("/api/trace/")) {
```
改为：
```
            if ("/api/runs/clear".equals(path)
                    && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(runs.clearRuns()));
                return;
            }
            if (path != null && path.startsWith("/api/trace/")) {
```

## 第 4 次调用：检查（只允许这两条）
```
./build.sh            → 期望输出 build ok
git diff --stat       → 只有 RunService.java 与 Main.java 两个文件
```

## 收工
总结 ≤2 行：两处改动是否完成、build 结果。不要写别的。
