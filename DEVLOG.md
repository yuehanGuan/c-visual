# DEVLOG · C/C++ 代码可视化教学工具

> **本文件是开发的唯一指挥中心。**
> AI 每轮开工只读本文件（必要时再读当前任务涉及的那个文件）；每轮收工必须回写 §1、§7、§8。
> 设计理由、架构论证在 [PLAN.md](PLAN.md)，**不要重复读**，只在需要追溯决策时读对应小节。

- 项目根：`cppviz/`
- 最后更新：2026-11-24（P6-A 轨迹图完成；基线已提交 `678d290`）
- 文档版本：v1.13（递归调用树 T2.10 待做）

---

## 0. 使用协议（人类与 AI 双方都必读）

### 0.1 开工时读什么
| 场景 | 读什么 | 不要读 |
|---|---|---|
| 常规开工 | `DEVLOG.md`（本文件） | PLAN.md、logs/ |
| 改前端 | + 当前涉及的 `web/*.js` | 其他 js |
| 改 tracer | + `tracer/tracer.py` + `docs/TRACE_SCHEMA.md` | Java 文件 |
| 质疑设计 | + PLAN.md 对应小节 | PLAN.md 全文 |

**禁止**：为“了解背景”而通读 PLAN.md；禁止要求人类复述需求。

### 0.2 收工时必须写什么（缺一不可）
1. **§1 当前状态**：里程碑、当前任务、阻塞、最近验证命令与结果。整块重写，不超过 10 行。
2. **§7 进度日志**：在**顶部**插入一条新记录，模板见 0.4。
3. **§8 记账**：更新已花 token 估算、更新任务状态。

### 0.3 硬性约束（违反即为返工）
- ❌ 不贴全量日志；验证只贴 `| tail -20`。
- ❌ 不整文件重写；用精确编辑。
- ❌ 单文件超过 300 行就拆。
- ❌ 不擅自扩大范围；任务板没有的任务不做，先提出来。
- ❌ 不擅自引入第三方依赖（Maven 已明确砍掉，见 K7）。
- ✅ 任务完成必须跑通该任务的“验收”命令，把命令与结果写进 §7。
- ✅ 踩到新的坑，立刻记入 §6。

### 0.4 日志条目模板（≤8 行）
```
### [日期] T0.1 · 安装 JDK 21 ✅
- 做了什么：brew install openjdk@21；写入 ~/.zshrc 的 JAVA_HOME
- 验证：javac -version → javac 21.0.x（通过）
- 改动文件：无
- 决策/发现：JDK 装在 /opt/homebrew/opt/openjdk@21
- token≈15k｜下一步：T0.2
```

### 0.5 指挥模板

派单模板见 [orders/README.md](orders/README.md)（只在派单时需要读，日常开工不用看）。

### 0.6 归档规则（控制本文件体积）

**硬预算：≤ 300 行 / ≤ 8k token**（基线 271 行）；**里程碑执行期允许 ≤ 330 行**，完成即归档回 300 内。超标就按下面顺序压缩：

1. 里程碑完成后，把 §7 里该里程碑的条目整段**剪切**到 `logs/M<编号>.md`；§7 只留当前里程碑。
2. 已完成里程碑在 §4 的整张任务表**折叠成一行**：
   `M0 ✅ 全部完成（5/5）→ logs/M0.md`，删掉明细表。
3. §6 只保留仍然有效的结论；已过时的划掉，不删（保留“为什么曾这么想”的价值）。

> 判据是 **token 不是行数**。理想区间是 3k–5k token；一旦要读超过 10k，说明没有归档，读它的成本会吃掉机制省下的钱。

---

## 1. 当前状态

- **里程碑**：M2-A 图形化 ✅｜P0 任意代码 ✅｜P1 STL 五件套 ✅｜T2.8 折叠 ✅｜T2.11 diff ✅｜**T2.9 轨迹 ✅**
- **当前任务**：无；下一单：递归调用树（T2.10）或压栈动画
- **环境**：macOS 26.2 arm64｜clang 17｜lldb 17｜JDK 21.0.13
- **验证**：`./smoke.sh` PASS；轨迹实测 `s` 43 点折线、`i` 40 点
- **累计 token**：约 1.48M 净内容

## 2. 项目锚点（几乎不变，新会话只读这一节也能干活）

**一句话**：把 C++ 代码一行一行执行给你看，同时把变量/数组/vector/map/递归栈帧画出来，面向算法竞赛初学者。

**技术栈**：Java 21（JDK 内置 HttpServer，零依赖，javac+jar 手工构建）＋ 原生 HTML/CSS/ES2020（零构建、零 CDN）＋ LLDB 内嵌 Python 作 tracer ＋ SVG 画图。

**四条铁律**
1. **只给用户自己的 `.cpp` 文件下断点**，绝不给头文件下断点 → 库调用天然变成一步，STL 才不会把步数预算烧光。
2. **存语义视图，不存内存视图**：trace 里是 `kind:"seq"` + 元素 + capacity，不是 `_M_start/_M_finish`。
3. **录制与回放彻底分离**：一次运行产出一个 trace 文件，前端只是播放器（后退/拖动/分享全免费）。
4. **`opaque` 兜底**：任何认不出的类型都要能渲染成兜底卡片，**绝不崩**。

**数据契约**：`docs/TRACE_SCHEMA.md`（T1.13 定稿）。在它定稿前，以 PLAN.md §5 为准。

**暂停点**：编译超时 → 直接弹窗（无 trace）；运行超时 → **不弹窗**，回放最后 200 步并高亮重复行。

---

## 3. 里程碑总览

| 里程碑 | 内容 | 人日 | 净 token | 状态 |
|---|---|---|---|---|
| M0 | 环境 + 骨架 + lldb 探针 | 0.5–1 | 75k | ✅ 完成 |
| M1 | 端到端可演示（编译→trace→播放） | 3–5 | 390k | ✅ 完成 |
| M2 | 图形化内存图 + 其余数据结构 | 4–6 | 440k | 🟡 A 部分完成 |
| M3 | TLE 回放、stdin、健壮性 | 3–4 | 180k | ⬜ |
| M4 | 打包（macOS/Windows）+ GdbEngine | 4–6 | 200k | ⬜ |
| | **合计** | **14–22** | **≈1.29M** | |

> ⚠️ 上表是**净内容**，不是账单。原始消耗约 **6.5M–10M**（原因与四种打法见 §8.0 与 §8.4）。

---

## 4. 任务板

> 状态：⬜未开始 🟡进行中 ✅完成 ⏸暂停 ❌取消
> 一个任务的粒度 = 一次会话能收工，预算 15k–40k token。

**M0 ✅ 5/5** · **M1 ✅ 13/13** → 明细见 `logs/M0.md`、`logs/M1.md`

### M2 · 数据结构与可读性

**已完成**：T2.1 grid、T2.2 text、T2.3 map、T2.4 set、T2.5 queue/stack、T2.6 pair/record、T2.7 ptr 箭头

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| T2.8 | 循环折叠（周期检测） | ✅ | 40 次循环 84 步 → 1 段 |
| T2.9 | 变量轨迹图（sparkline + 刻度条） | ✅ | `s` 上升曲线、`i` 直线 |
| T2.10 | 递归调用树视图 | ⬜ | DFS 压/弹栈可见 |
| T2.11 | diff 高亮（变化摘要 + 帧身份对齐） | ✅ | `s: 1 → 3`，递归 0 误报 |

### M3 · 健壮性与真实使用
| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| T3.1 | TLE 回放最后 200 步（10× 加速） | ⬜ | `tle.cpp` 停在死循环行 |
| T3.2 | 崩溃定位（SIGSEGV/SIGFPE） | ⬜ | 停在崩溃行 |
| T3.3 | stdin 多组测试数据 | ⬜ | 切换数据集重跑 |
| T3.4 | 程序输出与步骤时间轴对齐 | ⬜ | `printf` 挂到正确 step |
| T3.5 | trace 上限 64MB + 保留最近 50 次 | ⬜ | 连跑 20 次不泄漏 |
| T3.6 | 深递归/栈溢出提示 | ⬜ | 给出人话解释 |

### M4 · 打包与跨平台
| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| T4.1 | `jpackage` → `.app` / `.dmg` | ⬜ | 双击可开 |
| T4.2 | 工具链自检与引导提示 | ⬜ | 缺 clang 给中文指引 |
| T4.3 | `GdbEngine`（Windows/gdb 实现） | ⬜ | 同一份 trace 契约 |
| T4.4 | Windows：随包 MinGW-w64 + `.msi` | ⬜ | 干净机器可跑 |
| T4.5 | 中文文案与错误提示打磨 | ⬜ | — |

---

## 5. 已定决策（不再讨论，要改先写进这里）

| # | 决策 | 结论 |
|---|---|---|
| D0 | 交付形态 | 本地软件 = Java 后端 + HTML 前端，M1–M3 用系统浏览器打开 |
| D1 | 默认步数预算 | **5000**（UI 可调） |
| D2 | 语法高亮 | 自写正则（M1），M3 仍弱再考虑 CodeMirror |
| D3 | M1 是否含 stdin | **含**（竞赛代码没输入等于没用） |
| D4 | 界面语言 | 中文 |
| D5 | M4 是否内嵌浏览器 | 暂定系统浏览器；内嵌需引入 openjfx/JCEF，届时重议 |
| D6 | 构建工具 | **不用 Maven/Gradle**，`javac`+`jar`+`build.sh` |
| D7 | macOS 调试器 | **LLDB**（macOS 上 gdb 要 codesign，且 STL 需反解析字符串） |
| D8 | 内存图 | **SVG**（非 Canvas） |
| D9 | 预算打法 | **A：全程精细开发**（范围不砍） |
| D10 | 请求体格式 | `application/x-www-form-urlencoded`（JDK 解码）；`Json` **只做序列化**，不写解析器 |
| D11 | 代码编辑器 | 两态切换（编辑=textarea / 回放=高亮 div），不做覆盖层 |

---

## 6. 坑与结论

全部 33 条见 **[docs/PITFALLS.md](docs/PITFALLS.md)**，按编号排列。开工前只读你这次要碰的那一组。

**最容易致命的三条**
- `K29` 未构造完的 `std::map` 会让 lldb formatter 在 C++ 层死循环 → 必须用声明步守卫（`K31`）
- `K22` openclaw 派单必须带 `--thinking off`，且单 ≤2–3 个文件（否则撞 8192 输出上限，`K21`）
- `K19` 别把 lldb 输出接到 `head`：管道提前关闭会让 lldb 阻塞，伪装成死锁

## 7. 进度日志（倒序，最新在最上；每条 ≤8 行）

> 已归档：M0 / M1 / M2-A / P0 → `logs/`

### 2026-11-24 · P6-A 变量轨迹图（timeline.js）✅
- 新增 `src/main/resources/web/timeline.js`（`Timeline.render(container, steps, currentIdx)`）：从各 step 最内层帧 `frames[0]` 按出现顺序收变量名（≤6 个），scalar 取 `value`、seq 取 `items.length`；全为数值且≥2 点 → SVG 折线（当前步画 `#5ac8fa` 圆点），否则 → 刻度条（值变化时 `#f5b942` 高亮）；`index.html` 加 `#timeline` + script，`app.js` 在 `goTo()` 里渲染、`loadTrace` 里清空
- 实测（headless Chrome + CDP over pipe）：累加循环 `s`/`i` → `#timeline .tl-row` **2 行**，`s` 行 `<polyline>` **43 点**且 y 逐点不增（上升折线），圆点随步进移动（@2=6.2,19 → @mid=131.0,15.2 → @end=262.0,3.0）；char/bool 用例 `c`/`flag` 走刻度条（16 刻度、5/6 根高亮）；build.sh + smoke.sh PASS

### 2026-11-24 · P5-A diff 摘要条 + 修帧对齐（B3）✅
- `memory.js`：帧对齐由**数组下标**改为**帧身份** `fn + "#" + depth`（`frameKey`/`indexPrevFrames`）；找不到对应上一帧时该帧**不做任何 changed 标记**（宁可少标不乱标）。`renderCells` 无基准帧时也不再标 changed
- `memory.js`：新增变化摘要条 `.mem-diff`（插在 `container` 顶部、栈帧 SVG 之前）；只比**最内层帧（depth 0）**同名变量的可比较摘要值（scalar→value、seq→items+capacity、map/set→items 拼串、pair→first+second、其它→type）；最多 3 条 + `+N`；值 >12 字符截断加 `…`；无变化则整条不渲染。`style.css` 加 `.mem-diff`/`.diff-item`/`.diff-more` 样式
- 实测（无头 Chrome + CDP over pipe）：40 次循环 → 摘要文本 `s: 15 → 21`，`.mem-diff .diff-item` 长度 = 1；fib 递归压栈/出栈 → 摘要条 **0 条**（仅最后 `r: int → 3`），`.mem .slot.changed` ≤ 2（不再整片误标）
- 帧对齐 A/B（`outer`/`inner` 同名变量 `v`/`x`，压栈换函数那一步）：下标对齐误标 **10** 处 → 身份对齐 **6** 处，消除 4 处跨函数假阳性
- build.sh + smoke.sh PASS

### 2026-11-24 · P4-A 循环折叠（周期检测 + 按段导航）✅
- `app.js` 新增 `buildSegments(steps)`：按行号序列检测周期（周期长 1..8，reps≥3 且覆盖≥6 才算），把重复行序列折叠成一个「循环段」；`loadTrace` 后计算 `state.segments`/`state.segIdx`
- 导航：`next`/`prev` 在折叠开启时按段走（段末一步 → 跳下一段 `from`；段首一步 → 回上一段 `to`），关闭时恢复 idx±1 逐行；计数器在段内显示「循环 第 N 行 × R 次（本步 n/C）」，段外显示「第 n / M 步」；`index.html` 加 `#foldBtn`（折叠：开/关）切换 `state.folded`
- 实测（300 次循环，headless Chrome + CDP over pipe 读 `window.__viz`）：`steps=604  segments=5`（其中 1 个折叠段覆盖 600 步，period=2、reps=300）；build.sh + smoke.sh PASS

### 2026-11-24 · P3-B queue/stack 展开 ✅
- `tracer/tracer.py` 新增 queue/stack 分支（置于 vector/deque 之前，因 `queue<int, deque<int>>` 含 `deque<`）：优先 `_member(value,"c")` 取底层容器，无子节点则用 value 本身；输出 `kind=queue`（+`front`/`back`）或 `kind=stack`（+`top`），>200 置 `truncated`
- 前端 `memory.js` 增 queue/stack 显示（`front → [ 1 | 2 | 3 ] ← back`、`[ 10 | 20 ] ← top`，超宽自动退化并写入 `<title>`）与 `queue`/`stack` class；`style.css` 加 `#5ac8fa`/`#c792ea`
- 验证：qs.cpp → `q`=queue `["1","2","3"]`、`st`=stack `["10","20"]`；lldb EXIT=0 无卡死；回归 vector/stl/maponly/glob 全 EXIT=0

### 2026-11-24 · P3-C queue/stack 判断顺序 + 下钻底层容器 ✅
- `tracer/tracer.py`：`queue<`/`stack<` 分支**上移到 vector/deque 分支之前**（类型名 `queue<int, deque<int>>` 含 `deque<`，原来被 seq 截走）
- 取元素统一为：`_member(value,"c")` → 回退 `GetChildAtIndex(0)` → 有子节点则用它，否则用 value 本身；输出 `kind=queue/stack` + `size/items/front/back|top`，>200 置 `truncated`
- 验证：qs.cpp → `q` = `kind=queue items=["1","2","3"]`、`st` = `kind=stack items=["10","20"]`；回归 vector.cpp 仍 `kind=seq`；全程无卡顿

### 2026-11-24 · P3-A set / pair 展开 ✅
- `tracer/tracer.py` set/unordered_set 分支：按 `GetNumChildren()` 逐个子节点 `_text`，输出 `kind="set", size, items`（>200 置 `truncated`）；pair 分支取 `_member(value,"first"/"second")`（回退 `GetChildAtIndex(0/1)`），输出 `kind="pair", first, second, size=2`
- 前端 `memory.js`：`textOf` 增 `set`（`{ 1, 2, 3 }`，>6 个加 `…`，空集 `{ }`）与 `pair`（`( 7, 8 )`）分支，`renderSlot` 加 `set`/`pair` class；`style.css` 加 `.mem .slot.set text { fill:#f78c6c }` / `.mem .slot.pair text { fill:#c3e88d }`
- 验证：stl.cpp → `s` 为 `kind=set, items=["1","2","3"]`（有序）、`p` 为 `kind=pair, first=7 second=8`；lldb 全程 1.8s，无卡顿；build.sh + smoke.sh PASS

### 2026-11-24 · P2-D 按声明位置过滤非用户源文件变量 ✅
- `tracer/tracer.py` 新增 `_decl_in_src(value)`：`GetDeclaration()` → `GetFileSpec().GetFilename()`（LLDB 1703 无 `GetFile()`，已兼容），非空且 basename ≠ 用户源文件 basename 则跳过；声明信息为空则保留
- `_frame_vars` 在 `seen.add(name)` 之前调用，被过滤的变量不进 `_prev_vars`，声明步守卫不受影响
- 验证：stl.cpp（map）→ 栈帧只剩 `m`/`s`/`p`，`std::__1::` 命中 0；glob.cpp → `g_count` 仍出现（3 处）

### 2026-11-24 · P2-E 按名字过滤库内部静态变量 ✅
- `tracer/tracer.py` `_frame_vars`：在声明步守卫之前加名字过滤——剥离 lldb 给全局变量加的 `::` 前缀后，若名字含 `std::`、含 `::`、或以 `_` 开头则直接 `continue`，被跳过的变量不进 `_prev_vars`
- 坑：lldb 把全局变量报为 `::g_count`，不剥前缀就会被 `::` 规则误杀（`g_count` 一度消失）；`_node` 里原有的剥前缀只影响显示，挡不住过滤
- 验证：`samples/stl.cpp` → 变量只剩 `['m','s','p']`，无任何 `std::__1::` 噪音；`samples/glob.cpp` → `['g_count']` 仍在且无 `std::` 噪音

### 2026-11-24 · P2-C 前端 map 两列表格 + 去引号 ✅
- `tracer/tracer.py`：新增 `_unquote()`，只作用于 map 的 k/v（首尾成对 `"` 才剥），trace 里 key 变为 `apple` 而非 `\"apple\"`
- `src/main/resources/web/memory.js`：`textOf` 新增 `kind==="map"` 分支（`{ apple: 3, banana: 5 }`，超 3 对显示 `…`，空 map 显示 `{ }`）；`renderSlot` 给该行加 class `map`
- `src/main/resources/web/style.css`：追加 `.mem .slot.map text { fill: #82aaff; }`（并保留 name/type 原有颜色）
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS；lldb 跑 `samples/stl.cpp` → `"kind": "map", "size": 2, "items": [{"k": "apple", "v": "3"}, {"k": "banana", "v": "5"}]`；node 直调 `Memory.render` → `<g class="slot map">` + 值文本 `{ apple: 3, banana: 5 }`

### 2026-11-24 · P2-A 修两个 bug ✅
- Bug 1：`src/main/java/dev/cppviz/RunService.java` 把 `traced.exitCode() != 0` 改为 `traced.exitCode() < 0`，非 0 正退出码不再误判为 crash（真崩溃由 lldb 的 `reason == "crash"` 覆盖），并加注释说明原因
- Bug 2：`tracer/tracer.py` 删除写入节点调试字段 `_line` 的两行（try/except 块），trace 节点不再残留 `_line`
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS（含 "segfault classified as crash"）；`return 1` 实测 → `{"outcome":"ok","truncated":false}`，不再是 crash

### 2026-11-23 · P1-C map/set/pair 分支降级为安全版 ✅
- 做了什么：`tracer/tracer.py` 删除全部 `sys.stderr.write("DBG ...")` 调试行；map / unordered_map / set / unordered_set / pair 五个分支整段替换为 `node.update(kind="opaque", value="容器展开暂不可用")` + `return`，不再调用 `GetNumChildren()` / `GetChildAtIndex()` / `GetSyntheticChildren()` / `GetSummary()`；`bootstrap()` 里 `os.path.abspath` 改为 `os.path.realpath`
- 验证：vector（`VIZ_MAX_STEPS=200`）→ VIZ 条目 16，仍有 `"kind": "seq"` 且带 `capacity`；recursion → VIZ 条目 32；两者 exit=0，maponly 未跑（按要求留给人验）
- 改动文件：`tracer/tracer.py`｜token≈6k｜下一步：人验 maponly 不再死循环

### 2026-11-23 · P0-G 指针地址数值匹配 + 调试属性 ✅
- 做了什么：`memory.js` 的 `renderPtrArrows` 开头建数值索引 `byNum`（`Object.keys(addrPoints)` → `Number(k)` → `byNum[n]`），查表改为 `(addrPoints && addrPoints[link.target]) || byNum[Number(link.target)]`；返回值从字符串改为 `{ svg, drawn, miss, debug }`，`<svg class="mem">` 加 `data-ptr-drawn` / `data-ptr-miss` / `data-ptr-debug`（含 `Object.keys(addrPoints)` 与全部 `link.target`）
- 验证：真实 lldb trace（ptrtest.c，6 步）→ headless Chrome 读 `document.querySelector('.mem').dataset`：**ptrDrawn=2**（step5/6，`a.next→&b`、`p→&x` 两条都连上），miss=0；格式不一致用例（addr `0x16fdfecc4` vs target `0X16FDFECC4`）新代码 drawn=1，旧代码 drawn=0，证明数值匹配生效
- 发现：**原“字符串比对不可靠”的判断不成立**——真实 trace 里 `target` 与 `addr` 字符串严格相等，miss 全部是**地址真不在 addrPoints**（`inKeys=false`：栈外地址、未初始化指针 `0xfffffffffffffff0`、`new` 堆地址），数值匹配属额外保险而非修复主因
- 改动文件：`src/main/resources/web/memory.js`｜token≈12k｜下一步：把堆块地址加入 `addrPoints`，让指向堆对象的指针也能连上

### 2026-11-23 · P0-C 前端渲染 record（struct） ✅
- 做了什么：`memory.js` 的 `textOf` 新增 `record` 分支——字段递归取文本，输出 `{ v = 7 }`（`, ` 分隔），超过 4 个字段只显示前 4 个加 `, …`，`truncated:true` 时末尾加 `…`；`renderSlot` 给该行加 `record` class；`style.css` 加 `.mem .slot.record .slot-value { fill: #c3e88d; }`（与 scalar 的 `#d7dce8` 区分）
- 验证：`./build.sh` → build ok；curl 实跑 `struct Node { int v; }` → trace 里 `n` 为 `kind:"record"`、字段 `v=7`；node 直接调 `textOf`：单字段 `{ v = 7 }`、6 字段 `{ a = 0, b = 1, c = 2, d = 3, … }`、ptr 字段 `{ q = → 0x7ff }`、truncated `{ a = 1, … }`、嵌套 `{ w = { x = 1 } }`；headless Chrome 截图确认 `n` 行渲染出绿色 `{ v = 7 }`
- 改动文件：`src/main/resources/web/memory.js`、`src/main/resources/web/style.css`｜token≈9k｜下一步：P0-B 遗留（global 折叠/过滤方案）

### 2026-11-23 · P0-B record 类型 + 全局变量名清理 ✅
- 做了什么：`tracer/tracer.py` 的 `_node()` 在 string 分支后新增 record 分支（struct/class/union → `kind:"record"`，字段递归 `_node(child, None)`，超过 50 个字段截断并加 `truncated:true`）；变量名去掉开头的 `::`（`::g_count` → `g_count`）
- 验证：自测 `struct Node { int v; }` → `n` 为 `kind:"record"`，`fields[0]` = `{"name":"v","kind":"scalar","value":"7"}`；`g_count` 输出名不带 `::`
- 发现：lldb 的 `SBType` **没有** `IsRecordType()`，得用 `GetTypeClass()` 比对 `eTypeClassStruct/Class/Union`；已加 `_is_record()` 辅助函数兜异常
- 备注：字段递归刻意不传 heap，避免 struct 内含 vector 污染堆列表
- 改动文件：`tracer/tracer.py`｜token≈6k｜下一步：P0-C（global 折叠/过滤方案）

### 2026-11-23 · P0-A opaque 兜底 + 全局变量采集 ✅
- 做了什么：`memory.js` 的 `textOf` 补 `opaque`（`类型（不支持的类型） [值]`，muted 色）与 `ptr`（`→ target`，`target==="0x0"` → `→ null`）分支，default 兜底到 type/`未知类型`，`renderSlot` 空值写 `—`，类型/变量名各截断到 11/10 字防列重叠；`tracer/tracer.py` 的 `GetVariables(True, True, True, True)` 打开 statics+globals
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS；node 直接调 `textOf` 8 个 kind 全非空；实跑 `g_count` 出现在栈帧（`::g_count int 0/1`），`int*` → `→ 0x16fdfeba8`、`q=0` → `→ null`
- 发现：`GetVariables` 第 3 参数改 True 后，`<iostream>`/`<regex>` 等 STL 头会引入 **57 个 `std::` 全局变量/帧**（`ios_base::`/`locale::`/`ctype_base::` 常量），帧变量数 11→68；按指令未自行过滤，需后续决策（过滤 vs 折叠）
- 备注：`n`（struct Node）在 lldb 里是 `scalar` + `<unavailable>`，不是 `opaque`；opaque 分支为异常类型兜底（`<error: …>`）
- 改动文件：`src/main/resources/web/memory.js`、`tracer/tracer.py`｜token≈28k｜下一步：P0-B（global 折叠/过滤方案）

### 2026-11-23 · M2-A2b2 完成 ✅（指针箭头 + 栈上原生数组 + B2 跟步）
- 做了什么：`memory.js` 加 `<defs>` marker `mem-arrow`（`#5ac8fa`）；`renderFrame` 收集 `anchors`（seq 变量行右缘 12px + 行中线）并为栈上原生数组（`dataAddr` 匹配不到堆块）追加 `renderCells` 格行，帧高加 52px（先统计后算高）；`renderHeap` 返回块锚点；新 `renderArrows` 在帧与堆之后画三次贝塞尔 + 中点地址标签。`app.js`：`state.programOutput` + `goTo()` 里非末步显示「（程序运行结束后显示）」。`style.css` 追加 `.mem-arrow`/`.mem-arrow-label`
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS；vector 14 步实测 11 步有箭头（`M 616,81 C 316,81 316,188 16,188`，标签 `0x210`）；原生数组 `int a[4]` 5 步全部渲染为栈上格子；recursion 30 步 5 帧无异常；qlmanage 渲染 SVG 目视确认箭头+标签+箭头头部正确
- 备注：行地址文本右移 12px 避开箭头起点；标签上移 6px 避开曲线；栈上格子行下移 8px 避开变量行文字

### 2026-11-23 · M2-A2b1 完成 ✅（连续格子 + 堆区）
- 做了什么：`memory.js` 加 `renderCells(items, capacity, prevItems)`（40×24 格、间距 3、下标在上方、值超 6 字截断）与 `renderHeap()`；`render` 在栈帧后 16px 接堆区；`renderSlot` 的 seq 改显 `size N · cap M`（class `seq-meta`）；`style.css` 追加 `.cells/.heap-*/.seq-meta` 规则
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS；vector n=8 实测 `size 3 · cap 4` + 堆标题 + 1 块 3 实格 `10 20 30` + 1 虚线格；recursion 30 步 5 帧无异常
- 备注：capacity 超出 24 格时末格写 `+N`；新追加格与内容变化的格均描边 `#f5b942`

### 2026-11-23 · M2-A2a 完成 ✅（SVG 内存图骨架）
- 做了什么：`tracer/_buffer_addr()` 空指针守卫；新增 `web/memory.js`（addrShort/textOf/renderSlot/renderFrame/render）；`index.html`+`app.js` 接线；`style.css` 加 `.mem` 规则
- 验证：`./build.sh` → build ok；`./smoke.sh` → PASS；vector 示例 1 帧（`v`/`i` 两行带简写地址），recursion 示例 5 帧垂直排列、栈深 0–4 正确
- 备注：changed 行描边 `#f5b942`；地址取 `addr`/`dataAddr` 末 3 位

### 2026-11-24 · 变量轨迹图 T2.9 ✅
- 新增 `timeline.js`：每个变量一条横向时间线；数值型画 sparkline，非数值型画变化刻度条
- 实测：`s` 43 点上升曲线（加速，累加特征）、`i` 40 点直线；当前步有圆点标记
- 同轮：§6 坑登记拆到 `docs/PITFALLS.md`，DEVLOG 只留索引（读它的成本降一半）
- smoke PASS
- token≈0.07M 原始 / ≈20k 净

### 2026-11-24 · diff 高亮 T2.11 ✅（含 B3 修复）
- 新增顶部**变化摘要条**：`s: 1 → 3`（最多 3 条，超出写 +N）
- 同时修掉 B3：帧对齐从"数组下标"改成 `fn#depth` 身份匹配，递归压栈/弹栈不再整片误标
- 实测：循环里摘要正常；递归 5→4 帧过程中 diff 条数恒为 0（栈变化本身不算变量变化）
- smoke PASS
- token≈0.06M 原始 / ≈18k 净

### 2026-11-24 · 循环折叠 T2.8 ✅
- **关键设计**：不能按"连续同行走一步"折叠——`for` 行与循环体是交替命中的，永远不连续
- 改用**周期检测**：对周期 p=1..8 检查行序列重复，reps≥3 且覆盖≥6 步才折叠
- 实测：40 次循环 = 84 原始步 → 折叠成 1 段（×40），计数器显示「循环 第 6 行 × 40 次（本步 14/80）」
- 提供「折叠：开/关」开关，关掉即逐行
- smoke PASS
- token≈0.09M 原始 / ≈25k 净

### 2026-11-24 · STL 五件套打通 ✅
- map `{ apple: 3, banana: 5 }`（按 key 排序）、set `{ 1, 2, 3 }`、pair `( 7, 8 )`、
  queue `[ 1 | 2 | 3 ]`、stack `[ 10 | 20 ]`
- 关键顺序 bug：`queue<int>` 的类型名是 `std::__1::queue<int, std::__1::deque<int,...>>`，
  **含 "deque<"**，会被 vector/deque 分支先截走 → queue/stack 判断必须放在前面（K33）
- stack 的 formatter 只给一个子元素（底层容器），需下钻 `c` 成员再取元素
- `smoke.sh` PASS；vector 回归仍是 `seq` + capacity 8
- token≈0.10M 原始 / ≈30k 净

## 8. Token 记账与预算

### 8.0 两种口径（**别把这两个数混了**）

| 口径 | 含义 | 量级 |
|---|---|---|
| **净内容** | 真正“有价值”的读写量（读的文件 + 写的代码 + 增量思考） | ≈1.3M |
| **原始消耗** | 平台账单上的 input+output，**每轮都要重发全部上下文** | **≈6.5M–10M** |
| **计费口径** | 开 prompt caching 后，缓存命中通常打 1–2 折 | ≈2M–3.5M |

放大倍数 ≈ **5–8 倍**。公式：`消耗 ≈ 轮次数 × 平均上下文长度`。
一个 12 轮、上下文 15k→45k 的会话 ≈ 12×30k ≈ **370k**，而真正新增可能只有 40–60k。

> **结论：减少轮次比减少代码更能省钱。** 同样 300 行 JS，批量一次生成是 1 轮，逐个调试是 8 轮，差 8 倍。

### 8.1 已花
需求 0.12M + 文档 0.08M + M0 0.04M + **M1 0.10M** + **M2-A2a/b1/b2 0.04M** + **P0-A 0.03M** = **0.41M 净内容**，折算原始 **≈2.2M**。

### 8.2 余下预算
| 里程碑 | 净内容 | 原始（低） | 原始（高） | 主要成本点 |
|---|---|---|---|---|
| M0 | 75k | 0.4M | 0.6M | 环境、骨架、探针 |
| M1 | 390k | 2.0M | 3.1M | 编译服务 + tracer + 播放器三线联调 |
| M2 | 440k | 2.2M | 3.5M | 12 种渲染器 + 折叠 + 轨迹（**成本中心**） |
| M3 | 180k | 0.9M | 1.4M | 边界条件 |
| M4 | 200k | 1.0M | 1.6M | 打包与 Windows |
| **合计** | **≈1.29M** | **≈6.5M** | **≈10.2M** | 加已花：**7.7M–11.4M** |

### 8.3 **用实测标定，不要拍脑袋**
跑完 M0+M1 后，去平台看实际用量 `S`，则：

> **项目总量 ≈ 1.7 × S**

（M2 ≈ 1.1·M1，M3 ≈ 0.45·M1，M4 ≈ 0.5·M1。）
M0+M1 本身就是能验证技术路线的里程碑，即使之后放弃也不亏。

### 8.4 四种打法的成本
| 打法 | 原始消耗 | 做法 |
|---|---|---|
| **A 全程精细开发 ✅已选** | 6.5M–10M | 每个 UI 细节来回调 |
| B 分任务 + 严格归档 | 4M–6M | 按本文件执行，省 30–40% |
| C **人机分工** | **2M–3M** | agent 只做难且不确定的（`tracer.py`/`LldbEngine`/播放器状态机）；渲染器、CSS、打包脚本**一次性批量生成**后人工微调 |
| D **砍范围 + C** | **1.5M–2.5M** | M2 只做 `seq`/`grid`/`map`/`queue`（覆盖竞赛 90%）；M4 只做 macOS |

### 8.5 省 token 的杠杆（按效果排序）
1. **减少轮次**（最有效）：一个任务一次会话，结束即弃；机械性工作批量一次生成。**减少对话次数比少写代码更省钱。**
2. **本 DEVLOG 机制**：单轮开工上下文从 30k–50k 降到 3k–5k。
3. **先定契约再写实现**（T1.13 前置）+ **精确编辑而非整文件重写**（差 3–5 倍）+ 验证只贴 `tail -20`。

### 8.6 需求变更的成本
每轮讨论 ≈ 0.02M 净内容（≈0.12M 原始）。改 10 次 ≈ **1.2M 原始**，和 M2 一个量级。
**结论：改需求比改代码便宜，但别改 10 次——D1–D8 现在定死。**

---

## 9. 下一步

**基线已提交（`678d290`），T2.1–T2.9 / T2.11 与 P0–P6 全部完成。**

剩余任务按优先级：

1. **T2.10 递归调用树视图** — M2 最后一块，做完 M2 整段收官
2. **M3 健壮性**（T3.1–T3.6）— TLE 回放、崩溃定位、stdin 多组数据、输出对齐、trace 上限、深递归提示
3. **M4 打包**（T4.1–T4.5）— jpackage `.app`/`.dmg`、工具链自检、GdbEngine、Windows、中文文案

每单 = 一次会话，预算 15k–40k token；派单约束见 §0.3。
