package dev.cppviz;

import java.util.Map;

/**
 * Minimal JSON *writer*.
 *
 * <p>The request body arrives form-urlencoded, so no parser is needed. Values
 * supported: {@code null}, String, Number, Boolean, Map, Iterable, Object[].
 */
public final class Json {

    private Json() {
    }

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder(256);
        writeValue(sb, value);
        return sb.toString();
    }

    private static void writeValue(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String text) {
            writeString(sb, text);
        } else if (value instanceof Number || value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Map<?, ?> map) {
            writeObject(sb, map);
        } else if (value instanceof Iterable<?> items) {
            sb.append('[');
            boolean first = true;
            for (Object item : items) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeValue(sb, item);
            }
            sb.append(']');
        } else if (value instanceof Object[] items) {
            sb.append('[');
            for (int i = 0; i < items.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                writeValue(sb, items[i]);
            }
            sb.append(']');
        } else {
            writeString(sb, String.valueOf(value));
        }
    }

    private static void writeObject(StringBuilder sb, Map<?, ?> map) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            writeString(sb, String.valueOf(entry.getKey()));
            sb.append(':');
            writeValue(sb, entry.getValue());
        }
        sb.append('}');
    }

    private static void writeString(StringBuilder sb, String text) {
        sb.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    /** Self-test: {@code java -cp out/classes dev.cppviz.Json} */
    public static void main(String[] args) {
        check(write(null), "null");
        check(write("a\"b\\c"), "\"a\\\"b\\\\c\"");
        check(write("行\n列"), "\"行\\n列\"");
        check(write(42), "42");
        check(write(true), "true");
        // LinkedHashMap: iteration order is part of the expectation.
        Map<String, Object> ordered = new java.util.LinkedHashMap<>();
        ordered.put("t", "end");
        ordered.put("steps", 3);
        check(write(ordered), "{\"t\":\"end\",\"steps\":3}");
        Map<String, Object> nested = new java.util.LinkedHashMap<>();
        nested.put("items", java.util.List.of("x"));
        check(write(nested), "{\"items\":[\"x\"]}");
        System.out.println("Json self-test ok");
    }

    private static void check(String actual, String expected) {
        if (!expected.equals(actual)) {
            throw new AssertionError("expected " + expected + " but was " + actual);
        }
    }
}
