【只做 2 处 edit，不做别的】

文件：/Users/han./Documents/deepseek-harness/default-workspace/cppviz/tracer/tracer.py
不要读 DEVLOG，不要跑任何命令，不要写解释。两次 edit 后就停，总结一行。

## edit 1
把这一行（注意它是 4 空格缩进，位于 `_frame_vars` 里）：
```
    prev = _prev_vars.get(_cur_depth, set())
```
替换成：
```
    prev = _prev_vars.get(_cur_depth, set())
    arg_names = set()
    try:
        for arg in frame.GetVariables(True, False, False, True):
            arg_name = (arg.GetName() or "").lstrip(":")
            if arg_name:
                arg_names.add(arg_name)
    except Exception:
        pass
```

## edit 2
把这一行（8 空格缩进）：
```
        if name not in prev:
```
替换成：
```
        if name not in prev and name not in arg_names:
```

完成。总结一行写 "2 edits done"。
