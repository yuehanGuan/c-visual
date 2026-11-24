# C/C++ 代码可视化教学工具 · 项目计划

> 状态：设计评审中，未开始编码
> 版本：v0.1（2026-11-23）
> 目标平台：macOS 优先（当前开发机），Windows 后续
> 交付形态：本地桌面软件（Java 后端 + HTML 前端，jpackage 打包）

---

## 1. 目标与非目标

### 1.1 目标用户
- **算法竞赛初学者**：写 `for` 循环、数组、递归、`vector`/`map`/`queue`，但说不清"这一行执行时内存里发生了什么"。
- **教学者**：课堂上需要一个能暂停在任意一步、把变量变化讲清楚的工具。

### 1.2 要解决的问题
1. 代码**一行一行**执行给人看，当前行高亮。
2. 同时展示**变量的真实状态**：标量、数组、`vector`、`map`、`queue`、`stack`、`pair`、`struct`、指针。
3. **递归**能看见栈帧的压入与弹出（DFS/回溯是竞赛核心）。
4. 编译错误、编译超时、运行超时（TLE）、崩溃（RE）都能给出**人话解释**，而不是一堆英文。

### 1.3 明确不做（第一版）
- ❌ 内存越界 / 未定义行为的检测（那是 sanitizer 的活）
- ❌ `map`/`set` 的红黑树内部结构、模板实例化过程
- ❌ 多线程、多文件工程、`#include` 用户自定义头文件
- ❌ 在线判题、代码托管、多人协作
- ❌ 跑完 100 万步再任意回放（见 4.3 性能上限）
- ❌ 沙箱隔离（本地工具，用户跑自己的代码，不需要）

---

## 2. 环境现状（已实测 2026-11-23）

| 项 | 状态 | 说明 |
|---|---|---|
| macOS | 26.2 / arm64 | 开发机 |
| Apple clang | 17.0.0 | ✅ 编译器就绪 |
| lldb | 17（1703.0.236.21） | ✅ **Python API 实测可用** |
| Homebrew | 7.0.12 | ✅ 可用于装 JDK |
| JDK | **缺失** | ⚠️ 需 `brew install openjdk@21` |
| Maven | **缺失** | 决定不引入，见 3.2 |
| Python | 3.9.6（系统） | 与 tracer 无关，tracer 跑在 lldb 内嵌 Python 里 |

**结论：唯一需要安装的是 JDK 21。** 这是 M0 的第一步。

---

## 3. 技术选型

### 3.1 总体决策

| 决策点 | 选择 | 理由 | 被放弃的方案及其代价 |
|---|---|---|---|
| 后端语言 | **Java 21 LTS** | 用户指定；进程管理、HTTP、打包都成熟 | — |
| HTTP 服务 | **JDK 内置 `com.sun.net.httpserver`** | 零依赖，启动 <200ms | Spring Boot：多 30MB 依赖、启动 2s、jpackage 复杂 |
| 构建 | **`javac` + `jar` + `build.sh`** | 无依赖就不需要构建工具 | Maven/Gradle：额外安装 + 仓库网络依赖 |
| JSON | **自写最小实现（约 180 行）** | 请求/响应结构极简单，零依赖 | Jackson/Gson：多一个 jar；自己写需测试覆盖 |
| 调试器引擎 | **LLDB（macOS）** / GDB（Windows，M3 后补） | lldb Python API 能直接拿到容器元素，且 macOS 上 gdb 基本不可用 | gdb-only：macOS 上要 codesign，且 STL 要反解析字符串 |
| 前端 | **原生 HTML + CSS + ES2020，零依赖零构建** | 离线可用、双击即开、无 CDN | React/Vue：需 node + 构建 + 打包体积 |
| 内存图渲染 | **SVG** | 几百个节点规模下 SVG 足够，箭头/hit-test/缩放最省事 | Canvas：上千节点才有优势，但开发成本高 |
| 代码编辑器 | **透明 `<textarea>` 覆盖在高亮 `<pre>` 上** | 离线、可编辑、可高亮、约 60 行 JS | CodeMirror：需打包，收益要到 M3 才显现 |
| 传输 | **`POST /api/run` 同步返回 + `GET /api/trace/<id>` 流式取 JSONL** | M1 最简单；trace 落盘可复用、可分享 | WebSocket 实时推：并发/断线处理复杂，M3 再评估 |
| 打包 | **`jpackage`（M4）** | JDK 自带，产物含 JRE，用户无需装 Java | 手写 .app：要处理 JRE 路径，易出错 |

### 3.2 为什么砍掉 Maven
项目零第三方依赖 → Maven 唯一作用是"下载依赖"和"跑测试"，两者都用不上。
代价：后续若引入依赖（如 openjfx 做内嵌窗口），需要补 Maven 或手工管理 jar。**这个决定在 M4 可能被推翻**，届时改动成本约半天。

### 3.3 为什么 macOS 用 LLDB 而不是 GDB
1. macOS 上 gdb 需要 `codesign` 授权才能 attach，配置极烦；
2. **更关键**：LLDB 的 `SBValue.GetNumChildren()` / `GetChildAtIndex(i)` 通过 formatter 的"合成子元素"直接给出 `vector` 的第 i 个元素、`map` 的 `pair.first/second`。**不需要解析任何字符串，也不需要反推 `_M_start/_M_finish`。**
3. gdb 的 pretty-printer 输出是 `std::vector of length 3 = {1, 2, 3}` 这种文本，必须正则反解析，脆弱且易错。

跨平台因此需要两套引擎，但**共享同一份 JSONL 数据契约**，见 §5。

---

## 4. 架构

### 4.1 数据流

```
┌──────────────┐   POST /api/run {code, stdin, maxSteps}
│  浏览器      │ ────────────────────────────────────────┐
│  index.html  │                                          ▼
│  app.js      │                              ┌────────────────────┐
│              │                              │  RunService        │
│  ┌────────┐  │                              │  (编排 + 串行锁)    │
│  │ 代码面板│  │                              └─────────┬──────────┘
│  ├────────┤  │                                        │
│  │ 栈帧列 │  │                              ┌─────────▼──────────┐
│  ├────────┤  │                              │  CompileService    │
│  │ 变量图 │  │                              │  clang++ -g -O0    │
│  ├────────┤  │                              │  10s 超时          │
│  │ 控制条 │  │                              └─────────┬──────────┘
│  └────────┘  │                                        │ 可执行文件
└──────┬───────┘                              ┌─────────▼──────────┐
       │  GET /api/trace/<id>  (JSONL)        │  LldbEngine        │
       └──────────────────────────────────────│  起 lldb 子进程     │
                                              │  tracer.py 注入断点 │
                                              └─────────┬──────────┘
                                                        │ JSONL
                                              ┌─────────▼──────────┐
                                              │  ~/.cppviz/runs/   │
                                              │    <id>/trace.jsonl│
                                              └────────────────────┘
```

**核心思想：录制与回放彻底分离。** 一次运行只跑一次，产出完整 trace 文件；前端只是播放器。好处：拖动进度条、后退、分享、断线重连全部零成本。

### 4.2 关键机制：只在自己的源文件下断点

这是整个 STL 支持的**命门**。

规则：**只为用户自己那个 `.cpp` 文件的每一行创建断点，绝不为任何头文件创建断点。**

一条规则同时解决三件事：

| 场景 | 结果 |
|---|---|
| `sort(a, a+n)` 调用 | 头文件里没断点 → 直接跑到下一用户行，**库调用天然变成一步** |
| 用户自己的 `dfs()` 递归 | 函数体在同一文件 → **照样能停下看栈帧** |
| `vector::push_back` 循环 | 不进入 STL 内部 → 步数预算不会被烧光 |

要显示"`sort` 把它变有序了"，前端对相邻两步做 diff 即可，不需要进入库内部。

**副产品**：因为断点回调 `return False` 表示"不停下、继续跑"，执行控制完全由 lldb 驱动，Java 侧不需要逐步发命令——比"Java 循环发 `next`"快一个数量级。

### 4.3 性能上限与预算（**这是最硬的设计约束**）

经验量级：LLDB 断点回调 + 读取局部变量 ≈ **1~3 ms/步**（实测需在 M1 校准）。

| 步数 | 录制耗时 | 可行性 |
|---|---|---|
| 1,000 | 1~3 s | 流畅 |
| 5,000 | 5~15 s | 可接受（M1 默认值） |
| 20,000 | 20~60 s | 需进度条 |
| 1,000,000 | 20~50 min | **不可行** |

竞赛代码动辄 1e6 次循环，因此必须有三个机制（M2 落地）：

1. **步数预算**：默认 `maxSteps = 5000`，超限即 `Kill()` 并标记 `truncated`，UI 提示"程序执行超过 5000 步已截断，可能卡在循环里"。
2. **循环折叠**：前端把"连续命中同一行超过 N 次"压成一个节点——"第 7 行重复执行 8,432 次，i: 0 → 8432"，展开才看细节。**这是让 2 万步在视觉上可读的唯一办法。**
3. **变量轨迹图**：每个变量一条横向时间线，比逐步看快照更能建立"循环在干什么"的直觉。

> **天花板说明**：若将来要"跑完 100 万次再任意回放"，唯一出路是放弃外部调试器、在进程内解释 LLVM IR（JNI 挂 LLVM `ExecutionEngine`，或纯 Java 写 IR 解释器）。那是另一个量级的工程，**第一版不碰**。

### 4.4 trace 体积控制
- 只记录**用户源文件行**上的步骤（STL 内部不产生步骤）。
- 每步默认只 dump**最新帧** + 帧深度；`call`/`return` 事件才 dump 完整栈（否则递归深度 n 时是 O(n²) 体积）。
- 单条 trace 上限 64MB，超限即截断。

---

## 5. 数据契约（最重要的一节）

trace 文件是**引擎与 UI 之间唯一的契约**。换引擎（lldb→gdb）、换外壳（本地→Web）都不应改动它。

### 5.1 文件格式
JSONL，每行一条记录，行首带 `VIZ ` 前缀用于与 lldb 自身输出隔离。程序 `printf` 走 `target.output-path` 重定向到独立文件，**不污染 stdout**。

```
VIZ {"t":"meta","file":"main.cpp","exe":"a.out","maxSteps":5000,"engine":"lldb"}
VIZ {"t":"step","n":12,"line":7,"cols":[12,18],"frames":[...],"events":[...]}
...
VIZ {"t":"end","outcome":"ok","steps":842,"exit":0}
```

### 5.2 变量节点（view model）

**不做内存视图，做语义视图**——学生脑子里想的是"一个数组"，不是三个指针。

| `kind` | 用于 | 额外字段 | 教学点 |
|---|---|---|---|
| `scalar` | `int`/`double`/`bool`/`char` | `value` | — |
| `seq` | `T[]`、`vector<T>`、`string` | `items[]`、`size`、`capacity` | **扩容翻倍、size vs capacity** |
| `grid` | `T[105][105]`、`vector<vector<T>>` | `rows[][]`、`cols` | 下标与地址 |
| `text` | `string`、`char[]` | `chars[]` | 与字符数组等价 |
| `map` | `map`/`unordered_map` | `items[{k,v}]`，**按 key 排序** | 有序性、`m[k]` 会插入 |
| `set` | `set` | `items[]`（有序） | 去重 + 有序 |
| `queue` | `queue`/`deque` | `items[]`、`front`、`back` | 只能两端操作 |
| `stack` | `stack` | `items[]`、`top` | 后进先出 |
| `pair` | `pair` | `first`、`second` | — |
| `record` | `struct`/`class` | `fields[{name,node}]` | 成员布局 |
| `ptr` | `T*` | `target`（地址）、`to`（节点 id 或 null） | 箭头；链表/树 |
| `heap` | `priority_queue` | `items[]`、`isHeap` | 堆性质（M2） |
| `opaque` | 无法识别的类型 | `type`、`summary` | 兜底，绝不崩 |

**统一信封**（所有 kind 共有）：

```json
{"name":"v","kind":"seq","type":"vector<int>","addr":"0x16f...","size":3,"capacity":8,
 "items":[{"i":0,"v":"1"},{"i":1,"v":"2"},{"i":2,"v":"3"}]}
```

`type` 需归一化：去掉 `std::__1::` 前缀与 allocator 模板参数，`std::__1::vector<int, std::__1::allocator<int>>` → `vector<int>`。

### 5.3 帧与步骤

```json
{"fn":"dfs","depth":2,"addr":"0x16f...","line":14,
 "vars":[<node>...],"changed":["x","vis"]}
```

`changed` 由引擎对比上一快照计算（也可前端算，二选一，M1 定）：前端算可以省 volume，但需要保留上一步。

### 5.4 结果枚举（Java 侧）

```java
sealed interface Outcome {
  record Ok(int steps)                                    // 正常结束
  record Truncated(int steps)                             // 步数预算耗尽
  record CompileError(List<Diag> diags)                   // 编译失败（带行号列号）
  record CompileTimeout(long ms)                          // ⚠️ 直接弹窗，无 trace
  record RuntimeTimeout(int lastLine, int steps)          // ⚠️ 不弹窗，回放最后 200 步
  record Crash(String signal, int lastLine)               // SIGSEGV / SIGFPE
  record EngineError(String msg)                          // tracer 自身故障
}
```

**产品决策（已确认）**：编译超时 → 直接弹窗"编译超时"。**运行超时不做弹窗**，改为回放最后 200 步并高亮卡住的那一行——对竞赛教学，TLE 本身就是最重要的一课。

---

## 6. 目录结构规划

```
cppviz/
├── PLAN.md                     ← 本文档
├── README.md                   ← 使用说明（M1）
├── build.sh                    ← javac + jar
├── run.sh                      ← 构建并启动
├── smoke.sh                    ← 冒烟测试：编译→trace→校验 JSONL
├── src/main/java/dev/cppviz/
│   ├── Main.java               入口：探工具链 → 起 HTTP → 开浏览器
│   ├── HttpApi.java            路由、静态资源、session token 校验
│   ├── Json.java               最小 JSON 解析/序列化（~180 行）
│   ├── RunService.java         编排、串行锁、临时目录、清理
│   ├── CompileService.java     clang++ 调用、诊断解析、10s 超时
│   ├── Toolchain.java          探测 clang/lldb/gcc/gdb 及版本
│   ├── TraceEngine.java        接口：trace(exe, src, stdin, maxSteps) → Path
│   ├── LldbEngine.java         起 lldb 子进程、读 JSONL、超时杀进程树
│   ├── GdbEngine.java          （M4，Windows）
│   ├── Outcome.java            结果枚举（§5.4）
│   └── Diag.java               编译诊断（file/line/col/severity/msg）
├── src/main/resources/web/
│   ├── index.html              三栏布局
│   ├── style.css
│   ├── editor.js               高亮覆盖层 + 行号 + 当前行
│   ├── views.js                各 kind 渲染器（SVG）
│   └── app.js                  播放器状态机、fetch、键盘快捷键
├── tracer/
│   └── tracer.py               lldb 内嵌 Python，注入断点、输出 JSONL
├── samples/
│   ├── basic.cpp               标量 + 循环
│   ├── vector.cpp              push_back 扩容
│   ├── recursion.cpp           DFS 回溯
│   ├── map.cpp                 插入序 vs 遍历序
│   ├── tle.cpp                 死循环
│   └── compile_error.cpp       语法错误
├── docs/
│   └── TRACE_SCHEMA.md         契约文档（M1，供未来换引擎/换 UI）
└── packaging/                  jpackage 脚本（M4）
```

规模预估：M1–M2 完成时约 **2,800–3,500 行**（Java ~1,200，JS ~1,000，CSS ~250，Python ~350）。

---

## 7. 里程碑

> 人日为"一个人全职"口径；业余投入约 ×2 日历时间。

### M0 · 环境与最小闭环（0.5–1 人日）
- 装 JDK 21；写 `build.sh`/`run.sh`/`smoke.sh`
- `Main` 起 HttpServer，服务一个静态页
- 一个 lldb 探针：编译 `int a=1;` 并输出 1 行合法 JSONL

**验收**：`./run.sh` → 浏览器打开页面；`curl -X POST /api/run` 返回 meta。

### M1 · 端到端可演示（3–5 人日）
- `CompileService`：诊断结构化 + 编译超时
- `tracer.py`：行断点、`scalar`/`seq`/`grid`、栈帧、`stdout` 捕获
- 播放器：上一步/下一步/播放/速度/键盘快捷键、当前行高亮
- 编辑器：高亮覆盖 + 行号 + 错误行标红

**验收**：
- `samples/basic.cpp`、`vector.cpp`、`recursion.cpp` 能逐步回放；
- 5,000 步循环 **录制 < 20s**，UI 交互不掉帧；
- 编译错误能定位到行并显示中文提示。

### M2 · 数据结构与可读性（4–6 人日）
- `map`/`set`/`queue`/`stack`/`pair`/`record`/`ptr`
- 循环折叠、变量轨迹图、变化值闪烁
- 递归调用树视图

**验收**：
- `map.cpp`：能看出"插入顺序 ≠ 遍历顺序"；
- `recursion.cpp`：DFS 压栈/弹栈 + 回溯时变量恢复可见；
- 2 万步循环折叠后，时间轴节点数 < 100。

### M3 · 健壮性与真实使用（3–4 人日）
- TLE 回放（最后 200 步，10× 加速）、崩溃定位、深递归保护
- stdin 多组测试数据、程序输出时间轴对齐
- trace 体积上限与清理策略（保留最近 50 次）

**验收**：`tle.cpp` 停在死循环上并高亮重复行；连续跑 20 次不泄漏临时目录。

### M4 · 打包与跨平台（4–6 人日）
- `jpackage` → `.app` / `.dmg`；首次启动工具链自检
- Windows：随包 MinGW-w64（含 gdb）+ `GdbEngine` + `.msi`
- 中文界面与错误提示打磨

**验收**：干净机器双击可运行，无需装任何东西。

**合计：14–22 人日**（业余约 3–5 周）。

---

## 8. 风险登记

| # | 风险 | 影响 | 概率 | 对策 |
|---|---|---|---|---|
| R1 | **步数预算与"逐行全量"的用户预期冲突** | 高（核心体验） | 高 | M2 必须交付循环折叠 + 轨迹图；UI 明确提示"已截断" |
| R2 | LLDB 断点回调性能低于预期（>5ms/步） | 高 | 中 | M1 第一件事就是压测 5000 步；不行则降到 2000 步 + 更激进折叠 |
| R3 | STL 归一化漏类型（`unordered_map`、嵌套 `vector<vector<int>>`、`pair` 在 `map` 里） | 中 | 高 | `opaque` 兜底**绝不崩**；按真实教学代码的频次排序支持 |
| R4 | lldb 版本差异导致 API 行为变动（Apple lldb 17 → 未来版本） | 中 | 中 | tracer 只依赖 `SBTarget/SBBreakpoint/SBFrame/SBValue` 稳定子集 |
| R5 | 自写 JSON 出 bug | 中 | 中 | 写单元自测（含转义、中文、嵌套、大数）；JSONL 每行独立解析，坏了只丢一行 |
| R6 | 无 JDK 导致起步受阻 | 低 | 确定 | M0 第一条命令 `brew install openjdk@21` |
| R7 | Windows 版 gdb + MinGW 被杀软误报 | 高（分发） | 高 | 提前告知；考虑签名；或引导用户装 MSYS2 |
| R8 | `jpackage` + JavaFX 组合复杂 | 中 | 中 | 本方案 M1–M3 **不用 JavaFX**，只开系统浏览器，规避该风险 |
| R9 | 前端 SVG 在 2 万步下渲染卡顿 | 中 | 中 | 只渲染当前步；列表虚拟化；折叠优先于虚拟化 |
| R10 | 用户代码含中文/emoji 导致编码错乱 | 低 | 中 | 全链路 UTF-8；`LC_ALL=C` 只用于编译器诊断解析 |

---

## 9. 测试策略

1. **金样例（golden trace）**：`samples/*.cpp` 各配一份期望 trace 摘要（行号序列 + 关键变量值），`smoke.sh` 跑完对比。改 tracer 后一键回归。
2. **性能基准**：`bench.sh` 固定跑一个 5000 步循环，记录耗时，进 git 便于对比。
3. **JSON 自测**：`Json.java` 内含 `main` 自测用例。
4. **手工验收清单**：每个里程碑的"验收"条目转成 `docs/CHECKLIST.md`。

---

## 10. Token 花费估算

### 10.1 估算口径
- 一轮"读上下文 + 改 2–3 个文件 + 跑测试看结果" ≈ **20k–60k token**（含系统提示、文件内容、工具输出）。
- 单文件控制在 300 行内、用精确编辑而非整文件重写，能显著压低单轮成本。
- 整文件重写 vs 精确编辑，成本差 **3–5 倍**。

### 10.2 分阶段预估

| 阶段 | 交互轮次 | 预估 token | 备注 |
|---|---|---|---|
| 设计（本阶段） | 4–6 | 40k–80k | 已完成大半 |
| M0 环境与骨架 | 5–8 | 60k–120k | 装 JDK、HTTP 骨架、lldb 探针 |
| **M1 端到端** | 15–25 | **250k–500k** | 最大的一块：编译器服务 + tracer + 播放器三线并行调试 |
| **M2 数据结构** | 20–35 | **350k–700k** | 12 种 kind 的渲染器 + 折叠 + 轨迹，最耗 token |
| M3 健壮性 | 10–18 | 150k–350k | 边界条件多，但改动集中 |
| M4 打包跨平台 | 10–20 | 200k–400k | 打包试错 + Windows 引擎 |
| **合计** | **65–110** | **1.05M – 2.15M** | |

### 10.3 敏感度
- 若每轮都把整个文件贴回来 → **×3–5**（3M–8M）。
- 若严格用精确编辑 + 脚本化验证（只贴 `tail -20`）→ 可压到 **×0.6**（约 700k–1.3M）。
- **M2 是成本中心**（占 1/3）：12 个渲染器里，`map`/`set`/`queue`/`stack` 结构相似可共用组件，能省约 30%。

### 10.4 省 token 的具体做法（建议写进工作约定）
1. **`PLAN.md` + `TRACE_SCHEMA.md` 作为唯一事实来源**：新会话先读这两份，不要重述需求。
2. **一个里程碑一次会话**，收尾时更新 PLAN 的进度表；避免长会话反复重读历史。
3. **验证脚本化**：`./smoke.sh | tail -20`，不贴全量日志。
4. **保持文件 < 300 行**：超了就拆。
5. **UI 调整用描述而非截图**（截图会消耗大量 token）。
6. **先定契约再写实现**：`TRACE_SCHEMA.md` 稳定后，前后端可以分开改而互不返工——这是最大的省钱项。

### 10.5 成本对比参考
若不使用 AI 辅助、纯手写：14–22 人日。AI 辅助约能压缩到 8–12 人日（省在样板代码和调试上），但**评审与验收仍需人工**。

---

## 11. 待确认决策

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| D1 | 默认步数预算 | 2000 / 5000 / 20000 | **5000**（20s 内出结果），可在 UI 调整 |
| D2 | 编辑器语法高亮用自写正则还是引入库 | 自写 / CodeMirror 6 | **自写**（M1），M3 若嫌弱再换 |
| D3 | 是否 M1 就要 stdin | 是 / 否 | **是**（竞赛代码没输入等于没用，成本很低） |
| D4 | 界面语言 | 中文 / 中英 | **中文**（目标用户明确） |
| D5 | 是否保留"内嵌浏览器窗口"（M4） | 系统浏览器 / JavaFX WebView / JCEF | 先用**系统浏览器**；M4 视体验再定，JavaFX WebView 需引入 openjfx 依赖（推翻 §3.2） |

---

## 12. 下一步

1. 评审本计划，确认 D1–D5。
2. 批准后执行 M0：`brew install openjdk@21` → 骨架 → lldb 探针。
3. M1 开工前先写 `docs/TRACE_SCHEMA.md`，把 §5 落成可执行的契约（含一份手工样例 trace）。
