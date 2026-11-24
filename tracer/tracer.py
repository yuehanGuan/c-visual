"""LLDB tracer: emits one JSONL record per executed source line.

Driven explicitly (see bootstrap())::

    lldb -b -o "settings set target.output-path <file>" \\
            -o "command script import /path/tracer.py" \\
            -o "script import tracer; tracer.bootstrap()" \\
            -o run \\
            -o "script import tracer; tracer.finish()" \\
            -- ./a.out

Registering a scripted breakpoint callback *during* module import fails to
resolve the function name, and lldb then silently stops on the breakpoint
instead of continuing.  Hence the explicit bootstrap() command.

Records (every line starts with "VIZ ")::

    VIZ {"t": "meta", "src": "...", "lines": 8, "breakpoints": 4}
    VIZ {"t": "step", "n": 1, "line": 4, "col": 9, "frames": [...]}
    VIZ {"t": "end", "steps": 4, "reason": "ok", "exit": 0}

Variable nodes follow the view-model contract in docs/TRACE_SCHEMA.md:
``scalar`` | ``seq`` | ``grid`` | ``text`` | ``opaque``.

Environment: VIZ_SRC (required), VIZ_MAX_STEPS (default 5000), VIZ_STDIN.
"""

import json
import os
import re
import sys

import lldb

_steps = 0
_max_steps = 5000
_ended = False
_src = ""
_src_name = ""
_max_frames = 64
# guard: names seen in the previous step, per frame depth
_prev_vars = {}
_prev_fn = {}
_cur_depth = 0

_STD_NS_RE = re.compile(r"std::__\d+::|std::")


def _drop_allocator(text):
    """Remove ``allocator<...>`` template args (nested-safe) plus their comma."""
    out = []
    i = 0
    while True:
        idx = text.find("allocator<", i)
        if idx < 0:
            out.append(text[i:])
            break
        depth = 1
        j = idx + len("allocator<")
        while j < len(text) and depth:
            if text[j] == "<":
                depth += 1
            elif text[j] == ">":
                depth -= 1
            j += 1
        head = text[i:idx].rstrip()
        if head.endswith(","):
            head = head[:-1]
        out.append(head)
        i = j
    return "".join(out)


def _short_type(name):
    """std::__1::vector<int, std::__1::allocator<int>> -> vector<int>"""
    if not name:
        return ""
    out = _STD_NS_RE.sub("", name)
    out = _drop_allocator(out)
    return out.replace(" >", ">").strip()


def _emit(obj):
    sys.stdout.write("VIZ " + json.dumps(obj, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


def _text(value):
    text = value.GetValue()
    if text is None:
        text = value.GetSummary()
    if text is None:
        return "<unavailable>"
    return text


def _unquote(text):
    """Drop surrounding quotes from a rendered string (map keys/values only)."""
    s = str(text)
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    return s


def _addr_of(value):
    """Numeric address from an SBValue holding a pointer, or None."""
    try:
        raw = value.GetValue()
        return int(raw, 16) if raw else None
    except (TypeError, ValueError):
        return None


def _load_addr(value):
    """Address of the variable's own storage, or None if unavailable.

    Some lldb bindings return a plain int here, others an SBAddress.
    """
    try:
        addr = value.GetLoadAddress()
        if isinstance(addr, int):
            number = addr
        else:
            number = addr.GetAddress() if addr is not None else None
    except Exception:
        return None
    if number is None or number == 0 or number == lldb.LLDB_INVALID_ADDRESS:
        return None
    return number


def _buffer_addr(value):
    """Address of the first element of a vector/deque buffer, or None."""
    try:
        raw = value.GetNonSyntheticValue()
    except Exception:
        raw = value

    def _pointer_of(node):
        number = _addr_of(node)
        if number is None:
            inner = _wrapped_pointer(node)
            number = _addr_of(inner) if inner is not None else None
        return number

    # vector: __begin_ / _M_start; deque: __first_ (maybe under __start_).
    for path in (("__begin_",), ("_M_start",), ("__start_", "__first_"), ("__first_",)):
        node = raw
        for name in path:
            node = _member(node, name)
            if node is None:
                break
        if node is None:
            continue
        number = _pointer_of(node)
        if number is None or number == 0 or number >= 0xFFFFFFFFFFFF0000:
            continue
        return number
    return None


def _ptr_target(value):
    """Pointer value as a hex string; null pointers become '0x0'."""
    try:
        number = value.GetValueAsUnsigned()
    except Exception:
        number = _addr_of(value)
    if number is None:
        number = 0
    return hex(number)


def _member(raw, *names):
    """First valid child member by name, or None.

    (`or` is unsafe here: SBValue truthiness is not "is valid".)
    """
    for name in names:
        try:
            member = raw.GetChildMemberWithName(name)
        except Exception:
            member = None
        if member is not None and member.IsValid():
            return member
    return None


def _wrapped_pointer(raw):
    """Pointer hidden one level down (libc++ __compressed_pair)."""
    try:
        for i in range(raw.GetNumChildren()):
            child = raw.GetChildAtIndex(i)
            if child.GetValue() is not None:
                continue
            for j in range(child.GetNumChildren()):
                inner = child.GetChildAtIndex(j)
                if _addr_of(inner) is not None:
                    return inner
    except Exception:
        pass
    return None


def _vector_capacity(value, elem_size):
    """Best-effort capacity for libc++/libstdc++ vectors; None if unknown."""
    try:
        raw = value.GetNonSyntheticValue()
        begin = _member(raw, "__begin_", "_M_start")
        end_cap = _member(raw, "__end_cap_")
        if end_cap is not None and end_cap.GetValue() is None:
            # libc++ wraps the pointer in __compressed_pair.
            end_cap = _member(end_cap, "__value_")
        if end_cap is None:
            end_cap = _member(raw, "_M_end_of_storage")
        if end_cap is None:
            # libc++ stores __end_cap_ in an *anonymous* compressed_pair child.
            end_cap = _wrapped_pointer(raw)
        a, b = _addr_of(begin), _addr_of(end_cap)
        if a is None or b is None or elem_size is None or elem_size <= 0:
            return None
        return (b - a) // elem_size
    except Exception:
        return None


def _is_record(vtype):
    """True for struct/class/union types (lldb has no IsRecordType())."""
    try:
        return vtype.GetTypeClass() in (
            lldb.eTypeClassStruct,
            lldb.eTypeClassClass,
            lldb.eTypeClassUnion,
        )
    except Exception:
        return False


def _node(value, heap=None):
    """Convert one SBValue into a view-model node.

    `heap` (optional list) collects heap blocks of vector/deque buffers.
    """
    raw_name = value.GetName() or ""
    if raw_name.startswith("::"):
        raw_name = raw_name.lstrip(":")
    node = {"name": raw_name}
    vtype = value.GetType()
    type_name = _short_type(vtype.GetName())
    node["type"] = type_name

    load_addr = _load_addr(value)
    if load_addr is not None:
        node["addr"] = hex(load_addr)

    try:
        if vtype.IsArrayType():
            elem = vtype.GetArrayElementType()
            count = value.GetNumChildren()
            if elem is not None and elem.IsArrayType():
                cols = elem.size()
                rows = []
                for i in range(count):
                    row = value.GetChildAtIndex(i)
                    rows.append([_text(row.GetChildAtIndex(j)) for j in range(cols)])
                node.update(kind="grid", rows=rows, rowsCount=count, cols=cols)
            else:
                node.update(
                    kind="seq",
                    size=count,
                    items=[_text(value.GetChildAtIndex(i)) for i in range(count)],
                )
                if load_addr is not None:
                    node["dataAddr"] = hex(load_addr)
            return node

        if "queue<" in type_name or "stack<" in type_name:
            # std::queue / std::stack are adapters: elements live in the
            # underlying container (member "c"), not in the adapter itself.
            # NOTE: this check must precede the vector/deque check, because
            # the libc++ type name of std::queue contains "deque<".
            inner = _member(value, "c")
            if inner is None and value.GetNumChildren() == 1:
                inner = value.GetChildAtIndex(0)
            src = inner if (inner is not None and inner.GetNumChildren() > 0) else value
            count = src.GetNumChildren()
            limit = count if count <= 200 else 200
            items = []
            for i in range(limit):
                try:
                    items.append(_text(src.GetChildAtIndex(i)))
                except Exception:
                    continue
            if "queue<" in type_name:
                node.update(kind="queue", size=count, items=items)
                node["front"] = 0
                node["back"] = max(0, count - 1)
            else:
                node.update(kind="stack", size=count, items=items)
                node["top"] = max(0, count - 1)
            if count > 200:
                node["truncated"] = True
            return node

        if "vector<" in type_name or "deque<" in type_name:
            size = value.GetNumChildren()
            items = [_text(value.GetChildAtIndex(i)) for i in range(size)]
            node.update(kind="seq", size=size, items=items)
            elem_size = None
            elem_type = "?"
            try:
                elem_t = vtype.GetTemplateArgumentType(0)
                if elem_t is not None and elem_t.IsValid():
                    elem_size = elem_t.GetByteSize()
                    elem_type = _short_type(elem_t.GetName())
            except Exception:
                pass
            capacity = _vector_capacity(value, elem_size)
            if capacity is not None and capacity >= size:
                node["capacity"] = capacity
            data_addr = _buffer_addr(value)
            if data_addr is not None:
                node["dataAddr"] = hex(data_addr)
                if heap is not None:
                    block = {
                        "addr": hex(data_addr),
                        "type": elem_type,
                        "count": size,
                        "items": list(items),
                    }
                    if capacity is not None:
                        block["capacity"] = capacity
                    heap.append(block)
            return node

        if "map<" in type_name or "unordered_map<" in type_name:
            # libc++ formatters spin forever on *unconstructed* maps; the
            # declaration-step guard in _frame_vars keeps us away from those.
            count = value.GetNumChildren()
            limit = count if count <= 200 else 200
            items = []
            for i in range(limit):
                try:
                    child = value.GetChildAtIndex(i)
                    key = _member(child, "first")
                    if key is None:
                        key = child.GetChildAtIndex(0)
                    val = _member(child, "second")
                    if val is None:
                        val = child.GetChildAtIndex(1)
                    items.append({"k": _unquote(_text(key)), "v": _unquote(_text(val))})
                except Exception:
                    continue
            node.update(kind="map", size=count, items=items)
            if count > 200:
                node["truncated"] = True
            return node

        if "set<" in type_name or "unordered_set<" in type_name:
            count = value.GetNumChildren()
            items = []
            for i in range(min(count, 200)):
                try:
                    items.append(_text(value.GetChildAtIndex(i)))
                except Exception:
                    continue
            node.update(kind="set", size=count, items=items)
            if count > 200:
                node["truncated"] = True
            return node

        if "pair<" in type_name:
            first = _member(value, "first", "__first_")
            if first is None:
                first = value.GetChildAtIndex(0)
            second = _member(value, "second", "__second_")
            if second is None:
                second = value.GetChildAtIndex(1)
            node.update(kind="pair", first=_text(first), second=_text(second), size=2)
            return node

        if "string" in type_name:
            summary = value.GetSummary() or ""
            text = summary.strip('"')
            node.update(kind="text", value=text, chars=list(text))
            return node

        if _is_record(vtype):
            count = value.GetNumChildren()
            limit = count if count <= 50 else 50
            fields = []
            for i in range(limit):
                child = value.GetChildAtIndex(i)
                sub = _node(child, None)
                fields.append(sub)
            node.update(kind="record", fields=fields)
            if count > limit:
                node["truncated"] = True
            return node

        if vtype.IsPointerType():
            node.update(kind="ptr", value=_text(value))
            node["target"] = _ptr_target(value)
            return node

        node.update(kind="scalar", value=_text(value))
        return node
    except Exception as exc:  # never break the trace on an exotic type
        node.update(kind="opaque", value="<error: %s>" % exc)
        return node


def _decl_in_src(value):
    """True unless the value is declared in a header/other file, not the user source.

    LLDB exposes the declaration site as SBDeclaration.GetFileSpec(); older
    builds expose a plain GetFile() string.  Handle both.
    """
    try:
        decl = value.GetDeclaration()
        if decl is None or not decl.IsValid():
            return True
        decl_file = ""
        try:
            spec = decl.GetFileSpec()
            if spec and spec.IsValid():
                decl_file = spec.GetFilename() or ""
                if not decl_file:
                    decl_file = spec.GetDirectory() or ""
        except Exception:
            decl_file = ""
        if not decl_file:
            try:
                decl_file = decl.GetFile() or ""
            except Exception:
                decl_file = ""
        if not decl_file:
            return True
        return os.path.basename(decl_file) == os.path.basename(_src)
    except Exception:
        return True


def _frame_vars(frame, heap=None):
    nodes = []
    try:
        values = frame.GetVariables(True, True, True, True)
    except Exception:
        return nodes
    prev = _prev_vars.get(_cur_depth, set())
    # Arguments are always initialised at function entry, so the
    # declaration-step guard must not apply to them (a recursive call would
    # otherwise report its own parameter as "being declared").
    arg_names = set()
    try:
        for arg in frame.GetVariables(True, False, False, True):
            arg_name = (arg.GetName() or "").lstrip(":")
            if arg_name:
                arg_names.add(arg_name)
    except Exception:
        pass
    seen = set()
    for value in values:
        raw = value.GetName() or ""
        if not raw:
            continue
        # lldb reports globals as "::g_count"; strip the scope prefix before
        # filtering so user globals are not mistaken for library internals.
        name = raw[2:] if raw.startswith("::") else raw
        # Library internals are noise in user frames: std::__1::..., anything
        # "::"-qualified, and leading-underscore names.  Drop them here, before
        # the declaration-step guard, so they never reach _prev_vars.
        if "std::" in name or "::" in name or name.startswith("_"):
            continue
        if not _decl_in_src(value):
            continue
        seen.add(name)
        if name not in prev and name not in arg_names:
            # First sighting: the object may not be constructed yet.  Never
            # touch its children (libc++ spins forever on half-built maps).
            nodes.append({
                "name": name,
                "kind": "opaque",
                "type": _short_type(value.GetType().GetName()),
                "value": "（声明中，下一步展开）",
            })
            continue
        nodes.append(_node(value, heap))
    _prev_vars[_cur_depth] = seen
    return nodes


def _is_user_frame(frame):
    try:
        return (frame.GetLineEntry().GetFileSpec().GetFilename() or "") == _src_name
    except Exception:
        return False


def _dump_frames(thread, heap=None):
    """Frames from the user's own file only; runtime frames are noise."""
    frames = []
    try:
        total = min(thread.GetNumFrames(), _max_frames)
    except Exception:
        total = 1
    for index in range(total):
        try:
            frame = thread.GetFrameAtIndex(index)
            if not _is_user_frame(frame):
                continue
            name = frame.GetDisplayFunctionName() or frame.GetFunctionName() or "?"
            depth = len(frames)
            _cur_depth = depth
            if _prev_fn.get(depth) != name:
                _prev_vars[depth] = set()
            _prev_fn[depth] = name
            frames.append(
                {"fn": name, "depth": depth, "vars": _frame_vars(frame, heap)}
            )
        except Exception:
            break
    return frames


def _addr_key(bp):
    """Stable per-PC key, or None when it cannot be resolved."""
    try:
        if bp.GetNumLocations() == 0:
            return None
        addr = bp.GetLocationAtIndex(0).GetAddress()
        if not addr.IsValid():
            return None
        file_addr = addr.GetFileAddress()
        if not file_addr or file_addr == lldb.LLDB_INVALID_ADDRESS:
            return None
        return file_addr
    except Exception:
        return None


def _on_hit(frame, bp_loc, *rest):
    """Breakpoint callback.  Returning False means 'do not stop, keep going'."""
    global _steps
    if _steps >= _max_steps:
        # Stop here instead of Kill(): lldb reaps the inferior when the batch
        # exits, which is far quicker than killing from inside a callback.
        _finish("truncated")
        return True

    _steps += 1
    try:
        entry = frame.GetLineEntry()
        line = entry.GetLine()
        col = entry.GetColumn()
    except Exception:
        line, col = 0, 0

    heap = []
    try:
        frames = _dump_frames(frame.GetThread(), heap)
    except Exception:
        frames = []

    _emit(
        {
            "t": "step",
            "n": _steps,
            "line": line,
            "col": col,
            "frames": frames,
            "heap": heap,
        }
    )
    return False


def _finish(reason):
    global _ended
    if _ended:
        return
    _ended = True
    exit_code = None
    try:
        exit_code = lldb.debugger.GetSelectedTarget().GetProcess().GetExitStatus()
    except Exception:
        pass
    _emit({"t": "end", "steps": _steps, "reason": reason, "exit": exit_code})


def finish():
    """Driver calls this after `run` returns, to close the stream."""
    _finish("ok")


def bootstrap():
    """Set up breakpoints. Must run after this module finished importing."""
    global _max_steps, _src, _src_name

    _src = os.path.realpath(os.environ.get("VIZ_SRC", ""))
    _src_name = os.path.basename(_src)
    _max_steps = int(os.environ.get("VIZ_MAX_STEPS", "5000"))

    target = lldb.debugger.GetSelectedTarget()
    if not target or not target.IsValid():
        _emit({"t": "meta", "error": "no valid target"})
        return

    stdin_path = os.environ.get("VIZ_STDIN")
    if stdin_path:
        lldb.debugger.HandleCommand(
            'settings set target.input-path "%s"' % os.path.abspath(stdin_path)
        )

    try:
        with open(_src, "r", encoding="utf-8", errors="replace") as handle:
            total_lines = sum(1 for _ in handle)
    except OSError as exc:
        _emit({"t": "meta", "error": "cannot read source: %s" % exc})
        return

    # Breakpoints live on the user's own file only.  Header/STL code gets none,
    # which is what collapses e.g. sort() into a single step.
    placed = 0
    duplicates = 0
    seen = set()
    for line in range(1, total_lines + 1):
        bp = target.BreakpointCreateByLocation(_src, line)
        if not bp.IsValid() or bp.GetNumLocations() == 0:
            if bp.IsValid():
                target.BreakpointDelete(bp.GetID())
            continue
        key = _addr_key(bp)
        if key is not None:
            if key in seen:
                target.BreakpointDelete(bp.GetID())
                duplicates += 1
                continue
            seen.add(key)
        bp.SetScriptCallbackFunction(__name__ + "._on_hit")
        placed += 1

    _emit(
        {
            "t": "meta",
            "src": _src,
            "engine": "lldb",
            "lines": total_lines,
            "breakpoints": placed,
            "duplicates": duplicates,
            "maxSteps": _max_steps,
        }
    )
