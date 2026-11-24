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
