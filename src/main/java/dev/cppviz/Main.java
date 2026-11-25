package dev.cppviz;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Local HTTP entry point: static assets from {@code /web} plus the run API.
 *
 * <p>Bound to loopback only — this is a local teaching tool, not a service.
 */
public final class Main {

    private static final Map<String, String> CONTENT_TYPES = Map.of(
            "html", "text/html; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "json", "application/json; charset=utf-8",
            "svg", "image/svg+xml",
            "png", "image/png",
            "ico", "image/x-icon");

    private static final int DEFAULT_MAX_STEPS = 5000;
    private static final int MIN_STEPS = 50;
    private static final int MAX_STEPS = 20_000;

    private final RunService runs;
    private final EnvService env = new EnvService();

    private Main(RunService runs) {
        this.runs = runs;
    }

    public static void main(String[] args) throws IOException {
        Path tracer = resolveTracer();
        RunService runs = new RunService(tracer);

        Main app = new Main(runs);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/", app::handleApi);
        server.createContext("/", app::handleStatic);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();

        int port = server.getAddress().getPort();
        System.out.println("VIZ_PORT=" + port);
        System.out.println("VIZ_TRACER=" + tracer);
        System.out.flush();

        String url = "http://127.0.0.1:" + port + "/";
        if (!"1".equals(System.getenv("VIZ_NO_BROWSER"))) {
            openBrowser(url);
        }
    }

    private static Path resolveTracer() {
        String fromEnv = System.getenv("VIZ_TRACER");
        if (fromEnv != null && !fromEnv.isBlank()) {
            Path candidate = Path.of(fromEnv);
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath();
            }
        }
        Path local = Path.of("tracer", "tracer.py");
        if (Files.isRegularFile(local)) {
            return local.toAbsolutePath();
        }
        // Packaged app: the tracer is inside the jar.  Extract it next to the
        // runs so a read-only install location still works.
        try (InputStream in = Main.class.getResourceAsStream("/tracer.py")) {
            if (in != null) {
                Path dir = Path.of(System.getProperty("user.home"), ".cppviz");
                Files.createDirectories(dir);
                Path target = dir.resolve("tracer.py");
                Files.copy(in, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                return target;
            }
        } catch (IOException ignored) {
            // fall through to the error message
        }
        System.err.println("找不到 tracer 脚本：tracer/tracer.py（或 jar 内 /tracer.py）");
        System.err.println("请从项目根目录启动，或设置环境变量 VIZ_TRACER");
        System.exit(2);
        return null;
    }

    private void handleApi(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        try {
            if ("/api/run".equals(path) && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                handleRun(exchange);
                return;
            }
            if ("/api/runs/clear".equals(path)
                    && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(runs.clearRuns()));
                return;
            }
            if ("/api/env".equals(path) && "GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(env.check()));
                return;
            }
            if ("/api/env/install".equals(path)
                    && "POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                send(exchange, 200, "application/json; charset=utf-8", Json.write(env.install()));
                return;
            }
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
            if (path != null && path.startsWith("/api/trace/")) {
                handleTrace(exchange, path.substring("/api/trace/".length()));
                return;
            }
            send(exchange, 404, "application/json; charset=utf-8", "{\"error\":\"not found\"}");
        } catch (Exception failure) {
            send(exchange, 500, "application/json; charset=utf-8",
                    Json.write(Map.of("error", String.valueOf(failure))));
        }
    }

    private void handleRun(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> form = parseForm(body);

        String code = form.getOrDefault("code", "");
        String stdin = form.getOrDefault("stdin", "");
        int maxSteps = clamp(parseInt(form.get("maxSteps"), DEFAULT_MAX_STEPS));

        Map<String, Object> result = code.isBlank()
                ? Map.of("outcome", "compile_error",
                         "diags", java.util.List.of(Map.of(
                                 "line", 0, "col", 0, "severity", "error",
                                 "message", "代码为空")))
                : runs.run(code, stdin, maxSteps);

        send(exchange, 200, "application/json; charset=utf-8", Json.write(result));
    }

    private void handleTrace(HttpExchange exchange, String id) throws IOException {
        Path file = runs.traceFile(id);
        if (file == null) {
            send(exchange, 404, "application/json; charset=utf-8", "{\"error\":\"no such trace\"}");
            return;
        }
        byte[] body = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", "application/x-ndjson; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private void handleStatic(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        if ("/favicon.ico".equals(path)) {
            // Browsers ask for it unprompted; answer 204 with no body.
            exchange.sendResponseHeaders(204, -1);
            exchange.getResponseBody().close();
            return;
        }
        if (path.contains("..")) {
            send(exchange, 400, "text/plain; charset=utf-8", "bad path");
            return;
        }

        String resource = path.substring(1);
        try (InputStream in = Main.class.getResourceAsStream("/web/" + resource)) {
            if (in == null) {
                send(exchange, 404, "text/plain; charset=utf-8", "not found: " + path);
                return;
            }
            byte[] body = in.readAllBytes();
            exchange.getResponseHeaders().set("Content-Type", contentTypeOf(resource));
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        }
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> form = new LinkedHashMap<>();
        if (body == null || body.isBlank()) {
            return form;
        }
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            form.put(key, value);
        }
        return form;
    }

    private static int parseInt(String text, int fallback) {
        try {
            return text == null ? fallback : Integer.parseInt(text.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static int clamp(int value) {
        return Math.max(MIN_STEPS, Math.min(MAX_STEPS, value));
    }

    private static String contentTypeOf(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
        return CONTENT_TYPES.getOrDefault(ext, "application/octet-stream");
    }

    private static void send(HttpExchange exchange, int status, String type, String text)
            throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()
                    && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
                return;
            }
        } catch (Exception ignored) {
            // Fall through to the printed hint.
        }
        System.out.println("请手动打开：" + url);
    }
}
