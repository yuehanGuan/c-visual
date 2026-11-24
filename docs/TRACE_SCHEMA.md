# Trace 数据契约 v1

> 引擎（LLDB/GDB）与 UI 之间的**唯一契约**。换引擎、换外壳都不应改动本文件。
> 实际产出见 `~/.cppviz/runs/<id>/trace.jsonl`。

## 1. 文件格式

JSONL，UTF-8，每行一条记录。引擎侧在原始行前加 `VIZ ` 前缀，Java 端剥离后落盘，
因此落盘文件**不含** `VIZ ` 前缀。

| 记录 | 出现次数 | 说明 |
|---|---|---|
| `meta` | 恰好 1 条，首行 | 本次追踪的元信息 |
| `step` | 0..N 条 | 每执行一行源码一条 |
| `end` | 0..1 条，末行 | 结束原因；崩溃时可能缺失 |

### 1.1 meta

```json
{"t":"meta","src":"/abs/main.cpp","engine":"lldb","lines":12,"breakpoints":7,"duplicates":2,"maxSteps":5000}
```

失败时：`{"t":"meta","error":"cannot read source: ..."}`。

### 1.2 step

```json
{"t":"step","n":4,"line":9,"col":5,"frames":[...]}
```

- `n`：从 1 开始的步号。
- `line`：**用户源码**文件中的行号（1-based）。
- `col`：该 PC 对应的列（1-based），用于以后做更精确的高亮，v1 前端可忽略。
- `frames`：栈帧，`frames[0]` 是最内层。**只包含用户源码里的帧**，C++ 运行时帧（如 `start`）已被过滤。

### 1.3 end

```json
{"t":"end","steps":120,"reason":"truncated","exit":-1}
```

`reason` ∈ `ok` | `truncated`。`exit` 为被追踪进程退出码，未知为 `-1`。

## 2. 帧

```json
{"fn":"fib(int)","depth":0,"vars":[<node>, ...]}
```

`depth` 是**过滤后**的连续序号（0 = 最内层）。`vars` 是数组而非对象，**顺序即声明顺序**，前端依赖它保持稳定布局。

## 3. 变量节点

统一信封：`{"name":"v","type":"vector<int>","kind":"…", …}`

| `kind` | 用于 | 附加字段 |
|---|---|---|
| `scalar` | `int`/`double`/`bool`/`char`/指针 | `value`（字符串） |
| `seq` | 原生数组、`vector`、`deque` | `items[]`、`size`、可选 `capacity` |
| `grid` | 二维原生数组 | `rows[][]`、`rowsCount`、`cols` |
| `text` | `string` | `value`、`chars[]` |
| `opaque` | 认不出的类型 | `value`（兜底文本） |

**约定**

1. **所有值都是字符串**：调试器能给什么就给什么，不做数值推断，避免精度与格式歧义。
2. **`type` 已归一化**：去掉 `std::__1::` 与 allocator 模板参数，`std::__1::vector<int, std::__1::allocator<int>>` → `vector<int>`。
3. **`capacity` 可选**：取不到就省略，前端必须能处理缺失。
4. **`opaque` 绝不崩**：任何异常类型都退化为 `opaque` + 文本。
5. **未初始化变量的值可能是垃圾数字**（如 `-312852384`）。这是真实行为，不要抹掉，前端以灰色斜体呈现。

## 4. 不变量

1. `line` 一定落在 `meta.src` 这个文件里。
2. 一个 stop 只产生一条 `step`（多行映射同一 PC 的情况在引擎侧已去重）。
3. `steps` 单调递增，从 1 开始。
4. 步数上限由 `meta.maxSteps` 声明；超限则 `reason:"truncated"`。
5. **头部/STL 代码不产生 step**：`sort()` 之类的库调用被折叠成一步。

## 5. 结果枚举（HTTP 层，`POST /api/run` 的响应）

| `outcome` | 含义 | 前端表现 |
|---|---|---|
| `ok` | 正常结束（可能 `truncated:true`） | 允许回放 |
| `compile_error` | 编译失败，带 `diags[]` | 行标红 + 提示 |
| `compile_timeout` | 编译超 10s | **弹窗** |
| `runtime_timeout` | 死循环等，已保留部分 trace | 提示 + 回放最后若干步 |
| `crash` | 信号终止（段错误等），带 `exitCode` | 提示 + 停在崩溃行 |
| `engine_error` | 追踪器自身故障 | 提示，无回放 |

## 6. 版本化

破坏性改动（重命名字段、改变语义）必须把 `meta` 的 `engine` 旁增加 `"schema":2`，
并同步本文件。新增可选字段视为兼容改动。
