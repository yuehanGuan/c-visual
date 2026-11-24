# 坑与结论（K1–K33）

> 从 DEVLOG.md §6 拆出。开工前只读你**这次要碰的那一组**，不要通读。
> 每条格式：`K编号 | 结论 | 来源`

| # | 结论 | 备注 |
|---|---|---|
| K1 | lldb Python API 在本机**已实测可用**（`lldb-1703`，`LLDB_PY_OK`） | 不要再花时间验证 |
| K2 | 只给用户源文件行建断点，**绝不给头文件建断点** | STL 支持成立的前提 |
| K3 | 断点回调 `return False` = 不停下、自动继续 | 比 Java 侧循环发 `next` 快一个量级 |
| K4 | 必须 `settings set target.output-path <file>` 隔离 `printf` | 否则程序输出污染 JSONL |
| K5 | 杀 lldb 要杀**进程树**（`ProcessHandle.descendants()`） | 否则死循环的 inferior 残留 |
| K6 | macOS 类型名带 `std::__1::` 前缀 + allocator 模板参数，需归一化成 `vector<int>` | libc++ |
| K7 | 本机**没有 JDK、没有 Maven** | 只需 JDK，Maven 已砍（D6） |
| K8 | LLDB 约 1–3 ms/步：5000 步 ≈ 5–15s，2 万步 ≈ 20–60s | 别把默认值设成 2 万 |
| K9 | 必须 `-O0`；否则变量被寄存器化/消除，行号与变量对不上 | `-g -O0` |
| K10 | `_M_start/_M_finish` **不要碰**，用 `SBValue.GetNumChildren()` 拿合成子元素 | gdb 则需反解析摘要 |
| K11 | Java 端不做调试器协议解析，只读 `VIZ ` 前缀的 JSONL | 见 PLAN §3.3 |
| K12 | `SBBreakpoint` **没有** `Delete()` / `SetCallback()`：删除用 `target.BreakpointDelete(bp.GetID())`，回调用 `SetScriptCallbackFunction("module.func")`（传函数名，不是可调用对象） | Apple lldb 17 |
| K12 | （待填） | |
| K13 | **绝不能在模块导入期注册回调** —— 函数名还解析不到，lldb 会静默停在该断点（表现为 `steps: 0`）。必须 `command script import` 之后再显式调 `tracer.bootstrap()` | 本次最费时的坑 |
| K14 | 多个源码行会映射到同一 PC → 一次停下触发多次回调 → trace 出现重复步。**按 `GetFileAddress()` 去重**（启动前即可解析，不受 ASLR 影响） | 否则 step 1–3 会是同一行 |
| K15 | `SBProcess.GetStopID()` 在本版本**不存在**，别拿它做去重 | 用了会静默退化成 -1 |
| K16 | 实测性能：lldb 启动 **~1.6s + 约 3ms/步**。5000 步 ≈ 17s | 预算内，可放心用 |
| K17 | **一行写多条语句只产生一步**（按行断点的固有限制） | 示例代码保持正常排版 |
| K18 | 程序崩溃时 lldb 会**卡住不再执行后续命令** → 必须用"空闲超时 + 识别 `EXC_`/`SIG` 标记"判定崩溃 | 固定总超时会误判成 timeout |
| K19 | **别把 lldb 输出接到 `head`**：管道提前关闭会让 lldb 写入阻塞，伪装成死锁 | 我为此浪费了一轮 |
| K20 | 截断时别 `Kill()`，直接 `return True` 停在断点让 lldb 收尸：9.8s → **2.0s** | |
| K21 | **openclaw 单轮输出上限 8192 token**：一次改 4 个文件会让 `content=[]` 整轮作废 | 必须拆成 ≤3 个文件 |
| K22 | **`openclaw agent --thinking off` 是关键**：默认思考会吃光 8192 输出预算，关掉后小任务一次通过 | 派单必带 |
| K23 | 上一单的 openclaw **进程残留会占住会话**，导致新单直接 `aborted` | 派单前先 `pkill -f "openclaw agent"` |
| K24 | 偶发 `stop=error`（provider 侧）与输出截断是两回事，前者重试即可 | 看会话记录区分 |
| K25 | lldb 的 `SBType` **没有** `IsRecordType()`；判 struct/class/union 要用 `GetTypeClass()` | P0-B 遇到 |
| K25 | `frame.GetVariables(True, True, True, True)`（第 3 参数 statics+globals 打开）会把 libc++ 头里的**全局常量也当变量拉进来**：`<iostream>`/`<regex>` 可达 **57 个 `std::` 全局/帧**，帧变量数 11→68 | 帧高按变量数算，会把帧画得极高；需过滤/折叠 |
| K26 | 全局变量：`GetVariables` 第 3 参（statics）必须传 True；lldb 命名成 `::g_count`，显示要剥 `::` | P0-A 实测 |
| K27 | 地址匹配**必须按数值**（`Number(addr)`）比对，字符串相等在实测中会失败 | P0-G 才修好 |
| K28 | 给 SVG 加 `data-*` 统计属性（drawn/miss/debug），能让"画不出来"立刻可量化，省掉猜测轮次 | 强烈推荐 |
| K29 | **未构造完的 `std::map` 会让 libc++ formatter 在 C++ 层死循环**，Python 无法中断 | 必须避免读声明步的容器 |
| K30 | `os.path.abspath` 不解析符号链接（/tmp→/private/tmp），会让 lldb 断点全失效 → 用 `realpath` | |
| K31 | 安全展开容器的正解：**变量首次出现的那一步不读它**（未构造对象会卡死 formatter），下一步再读 | `_prev_vars` 守卫 |
| K32 | 库内部静态变量的声明文件为空，`GetDeclaration` 过滤无效 → 改用**名字过滤**（含 `std::` 或 `::` 就跳过），且必须先把全局的 `::` 前缀剥掉 | P2-E |
| K33 | 适配器类型名里含底层容器名（`queue<int, deque<int>>` 含 `deque<`）→ **queue/stack 的分支必须放在 vector/deque 之前**，否则被误判成 seq | P3-C 实测 |

---
| K34 | **被调试的二进制不能放在 `~/Documents` / `~/Desktop` / `~/Downloads` 下**：debugserver 是独立进程，macOS TCC 静默拒绝它访问受保护目录，于是 `lldb -b ... run` **挂起且无任何报错**（连 `Process launched` 都不打印）。同一二进制拷到 `/tmp` 或 `~/.cppviz/` 即刻正常 | 症状极具迷惑性：attach 模式正常、立即退出的程序正常、只有 launch 持续运行才挂。排查用对照法：`cp 二进制 /tmp` 再 `lldb run` |
| K35 | **调用栈帧的身份只能由函数名决定**：把渲染用的 label（含运行时变量值）也算进最长公共前缀匹配，局部变量从 `opaque`(值空) 变成 `scalar`(有值) 时 label 就变了，同一个函数会被误判成不同帧 → 平白多出一个 root | label 只用于显示；匹配只比 `fn` |
| K36 | 源码里的裸 NUL 字节（`'\x00'` 写成真字节）会让 `file` 报 "data"、`grep` 报 "Binary file matches"，改动时容易整段被跳过 | 写成 `'\u0000'` 转义序列 |
| K37 | **声明步守卫的键必须是"帧身份"，不能是帧序号 depth**：递归压栈时所有旧帧 depth 全部 +1，按 depth 记账会让新帧继承父帧的"已见变量"集合 → 守卫被跳过，未构造的 `std::map` 被当已构造读（实测幽灵 `size: 1876945921` 的假元素），父帧反而误显"声明中"。键用 `frame.GetCFA()`（**不能用 GetFP**：叶子函数复用调用者的 frame record，实测 bump/main 的 FP 相同 → 守卫状态被合并），并在每步收尾删掉已不在栈上的键 | B1 的真根因；补 `global` 只治了表层；GetFP 只治了一半 |
| K38 | **LLDB 内嵌 Python 的 stdout 在 `LC_ALL=C` 下是 US-ASCII + `errors="ignore"`**：`json.dumps(..., ensure_ascii=False)` 里的中文被**静默丢弃**（不是 `?`，是直接消失），trace 里就剩 `"value": ""`。Java 的 `LldbEngine` 恰好设了 `LC_ALL=C`。修法：`sys.stdout.buffer.write(line.encode("utf-8"))`，兜底 `ensure_ascii=True` | B2 的真根因；手工跑 lldb 没带 `LC_ALL=C` 时**不复现**，极易误判成守卫/前端问题 |
| K39 | **视觉改动的验收可以完全无头**：`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,860 --virtual-time-budget=15000 --screenshot=x.png "http://127.0.0.1:PORT/#sample=swap&run=3"`；同一 URL 用 `--dump-dom` 可 grep `data-ptr-drawn/miss`，截图像素差用 Pillow 量化。深度链接 `#sample=<key>&run=<step>` 会自动跑示例并跳到该步 | 比每次开浏览器手点快一个量级，且可写进验收记录 |
| K40 | **数大括号前必须先剥掉字符串/字符字面量和注释**：`printf("}")`、`// }`、跨行 `/* { } */` 都会让"整行只有 `}`"的判断错位，提示就挂到错误的行上。做法：逐字符扫描，维护 `inBlock` 跨行状态，字面量整体替换成空格（保留位置感） | T-3.2 实测；`int a[] = {1,2};` 这类同行闭合也不需要提示（只对 bare-close 行出提示） |
| K41 | **改前端后必须 `./build.sh` 再起服务**：`build.sh` 把 `src/main/resources/.` 拷进 `out/classes`，`Main` 用 `getResourceAsStream("/web/...")` 从 classpath 读；只改 `src` 而不重建，浏览器拿到的还是旧文件（表现：改动"没生效"） | 排查时先看 `out/classes/web/<file>` 的 mtime |
