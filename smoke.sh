#!/usr/bin/env bash
# Acceptance test: build -> serve -> trace -> API outcomes.
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
JAVA="$JAVA_HOME/bin/java"
CXX="${CXX:-clang++}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "   $*"; }

echo "== T0.2 build =="
./build.sh
[ -d out/classes ] || fail "out/classes missing"
ls out/classes/dev/cppviz/*.class >/dev/null 2>&1 || fail "no class files"
pass "classes ok"

echo "== T1.1 json writer =="
"$JAVA" -cp out/classes dev.cppviz.Json > /dev/null || fail "Json self-test failed"
pass "json ok"

echo "== T0.3 server =="
VIZ_NO_BROWSER=1 "$JAVA" -cp out/classes dev.cppviz.Main > out/server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

PORT=""
for _ in $(seq 1 100); do
  PORT=$(sed -n 's/^VIZ_PORT=//p' out/server.log 2>/dev/null | head -1)
  [ -n "$PORT" ] && break
  sleep 0.1
done
[ -n "$PORT" ] || fail "server did not report VIZ_PORT (see out/server.log)"
BASE="http://127.0.0.1:$PORT"

for asset in / /style.css /app.js /editor.js /views.js; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")
  [ "$code" = "200" ] || fail "asset $asset returned $code"
done
pass "static assets ok (port $PORT)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/nope.css")" = "404" ] || fail "missing 404"
pass "404 ok"

echo "== T0.4 lldb tracer =="
"$CXX" -std=c++17 -g -O0 -fno-omit-frame-pointer samples/basic.cpp -o out/a.out
VIZ_SRC=samples/basic.cpp VIZ_MAX_STEPS=1000 lldb -b \
  -o "settings set target.output-path out/a.out.txt" \
  -o "command script import $(pwd)/tracer/tracer.py" \
  -o "script import tracer; tracer.bootstrap()" \
  -o run \
  -o "script import tracer; tracer.finish()" \
  -- out/a.out > out/trace.log 2>&1 || true

VIZ_COUNT=$(grep -c '^VIZ' out/trace.log || true)
[ "$VIZ_COUNT" -ge 3 ] || fail "expected >=3 VIZ records, got $VIZ_COUNT"
grep -q '"t": "meta"' out/trace.log || fail "missing meta"
grep -q '"t": "step"' out/trace.log || fail "missing step"
grep -q '"t": "end"' out/trace.log || fail "missing end"
grep -q '^3$' out/a.out.txt || fail "program stdout not redirected"
pass "VIZ records=$VIZ_COUNT, program stdout isolated"

echo "== T1.x API outcomes =="
post() { curl -s -X POST "$BASE/api/run" "$@"; }
field() { sed -n "s/.*\"$2\":\([^,}]*\).*/\1/p" <<<"$1" | head -1; }

R=$(post --data-urlencode "code@-"<<'EOF'
#include <cstdio>
int main() {
    int a = 1;
    int b = a + 2;
    printf("%d\n", b);
    return 0;
}
EOF
)
[ "$(field "$R" outcome)" = '"ok"' ] || fail "expected ok, got: $R"
[ "$(field "$R" steps)" = "4" ] || fail "expected 4 steps, got: $R"
pass "ok: 4 steps"

TID=$(field "$R" traceId | tr -d '"')
LINES=$(curl -s "$BASE/api/trace/$TID" | wc -l | tr -d ' ')
[ "$LINES" -ge 3 ] || fail "trace fetch returned $LINES lines"
pass "trace endpoint ok ($LINES lines)"

R=$(post --data-urlencode "code@samples/compile_error.cpp")
[ "$(field "$R" outcome)" = '"compile_error"' ] || fail "expected compile_error, got: $R"
grep -q '"line":4' <<<"$R" || fail "compile_error missing line 4: $R"
pass "compile_error with line number"

R=$(post --data-urlencode "maxSteps=120" --data-urlencode "code@-"<<'EOF'
int main() {
    int i = 0;
    while (1) {
        i++;
    }
    return 0;
}
EOF
)
[ "$(field "$R" outcome)" = '"ok"' ] || fail "expected ok+truncated, got: $R"
[ "$(field "$R" truncated)" = "true" ] || fail "expected truncated, got: $R"
pass "infinite loop truncated at step budget"

R=$(post --data-urlencode "code@-"<<'EOF'
int main() {
    int *p = 0;
    *p = 42;
    return 0;
}
EOF
)
[ "$(field "$R" outcome)" = '"crash"' ] || fail "expected crash, got: $R"
pass "segfault classified as crash"

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
trap - EXIT

echo "PASS"
