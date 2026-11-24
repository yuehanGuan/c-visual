# DEVLOG · C/C++ 代码可视化

> **单一指挥文件。新会话只读本文件就能接手，不需要聊天历史。**
> 历史日志在 `logs/`，坑的全文在 `docs/PITFALLS.md`，数据契约在 `docs/TRACE_SCHEMA.md`。

- 项目根：`cppviz/`
- 版本：v2.1.3（2026-11-24，T-1 + T-3.1 + T-3.2 + T-3.3 完成）
- 最后验证：`./smoke.sh` → **PASS**（2026-11-24 22:09，T-3.3 后复测）

---

## 0. 角色与派单规矩（AI 必读，违反就是白干）

### 0.1 你的角色
**你是架构师 + 验收者，不写项目代码。** 所有代码由 openclaw 执行：

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
openclaw agent --agent main --session-key <唯一名字> --thinking off \
  --message-file orders/<单子>.md --timeout 600 > out/oc-<名字>.log 2>&1
```

写完代码后**你必须自己验收**（跑命令、量 DOM、截图），不能相信 agent 的自我汇报。

### 0.2 派单五条硬规矩（从 30+ 次失败里换来的）

| # | 规矩 | 不遵守的后果 |
|---|---|---|
| 1 | **必须带 `--thinking off`** | 默认思考吃掉 8192 输出预算 → `content=[]` 整轮作废 |
| 2 | **单 ≤ 2–3 个文件** | 超出必撞输出上限 |
| 3 | **单条工具调用 ≤ 40 行**，禁止"一次写完整个文件" | 同上 |
| 4 | **派单前 `pkill -9 -f "openclaw agent"`** | 残留进程占住会话 → 新单直接 `aborted` |
| 5 | **不让 agent 自己验证**；验收命令由你在派单后自己跑 | 它跑会卡死的测试会把整轮拖死 |

### 0.3 派单写法
- 把已知事实**直接写进单子**（例如"`fn` 形如 `fib(int)`"），**禁止让它去探索**——探索会吃光输出预算。
- 给它**逐次工具调用的清单**（"第 1 次调用做 X，第 2 次做 Y"）。
- 极度复杂时压到极限写法："**只做 2 处 edit、不许读文件、不许跑命令**"，这招成功过。
- 模板见 `orders/README.md`。

### 0.4 每轮收工必须回写
1. 本文件 §1（当前状态）
2. 本文件 §7 顶部加一条 ≤5 行日志
3. 发现新坑 → 追加到 `docs/PITFALLS.md`（编号接着 K42 往后编）

---

## 1. 当前状态

- **能用了**：`./run.sh` 启动，浏览器自动打开，输入任意 C++ 代码 → 逐行回放 + 内存图
- **T-1 已完成**：B1/B2 已修，见 §4；**T-3.1/2/3 已完成**；下一件 T-3.4（run 目录清理按钮）
- **阻塞**：无
- **已知 bug**：1 个（B3，只影响手工在 `/tmp` 下测试，不影响产品）
- **环境**：macOS 26.2 arm64｜Apple clang 17｜lldb 17｜JDK 21.0.13（`/opt/homebrew/opt/openjdk@21`）
- **代码规模**：Java 823 行｜前端 2315 行（含 html/css）｜Python（tracer）716 行
- **累计 token**：约 **1.72M 净内容** / 约 4.9M 原始

---

## 2. 项目锚点

### 2.1 一句话
把 C++ 代码一行一行执行给学生看，同时把**栈帧、变量地址、数组/容器内容、指针指向、递归结构**画出来。
目标用户是**初学者**：他们写得出代码，但不知道代码到底做了什么。

### 2.2 技术栈（已定死，不要改）
- 后端：Java 21，**JDK 内置 `com.sun.net.httpserver`**，零第三方依赖，`javac` + `jar`，无 Maven
- 前端：原生 HTML/CSS/ES2020，**零构建、零 CDN**，SVG 画内存图
- tracer：**LLDB 内嵌 Python**（`tracer/tracer.py`），逐行断点导出 JSONL
- 未做打包（用户明确说不用打包）

### 2.3 运行与验证
```bash
cd cppviz
./run.sh          # 构建 + 启动 + 开浏览器，stdout 会打印 VIZ_PORT
./smoke.sh        # 全链路验收，必须 PASS
```

### 2.4 目录
```
src/main/java/dev/cppviz/    Main(路由) Json CompileService TraceEngine LldbEngine RunService
src/main/resources/web/      index.html style.css app.js(播放器) memory.js(SVG内存图)
                             editor.js(代码高亮) views.js(兜底) timeline.js(轨迹) calltree.js(调用树)
tracer/tracer.py             LLDB 内嵌 Python，逐行断点 → JSONL
docs/TRACE_SCHEMA.md         数据契约（引擎 ↔ UI）
docs/PITFALLS.md             坑 K1–K42
orders/                      派单文件 + README(模板)
samples/                     basic vector recursion compile_error stl qs glob maponly
logs/                        归档日志 + 截图
```

### 2.5 数据流
```
代码 → clang++ -g -O0 → lldb + tracer.py（只给用户自己的 .cpp 下断点）
     → JSONL（meta / step / end）→ Java 落盘 ~/.cppviz/runs/<id>/trace.jsonl
     → 前端 fetch → 按 kind 渲染
```

**四条铁律**
1. **只给用户自己的源文件下断点**，头文件一律不下 → `sort()` 之类自动变成一步，STL 不会烧光步数预算
2. **存语义视图不存内存视图**（`kind:"seq"` + items，不是 `_M_start`）
3. **录制与回放分离**（一次运行一份 trace，前端只播放）
4. **`opaque` 兜底永不崩**，但见 §4-B2 的渲染瑕疵

---

## 3. 已实现（全部经实测验收）

| 能力 | 状态 | 关键证据 |
|---|---|---|
| 标量 / 一维数组 / 二维数组 | ✅ | 数组就地展开成带下标的格子 |
| `vector` | ✅ | 栈上控制块 + 堆上缓冲 + 箭头 + `capacity` 虚线空位 |
| `struct` / `class` | ✅ | `{ v = 3, next = → null }` |
| 指针 / 链表 | ✅ | 括号形箭头连到目标行（2.4px + 9px 箭头，跨帧可见），`ptrDrawn:2 / ptrMiss:0` |
| 全局变量 | ✅ | `g_count @ 0x000` 独立地址段；库内部静态量已过滤 |
| `map` | ✅ | `{ apple: 3, banana: 5 }`，**按 key 排序** |
| `set` | ✅ | `{ 1, 2, 3 }`（插入顺序 3,1,2，显示自动有序） |
| `pair` | ✅ | `( 7, 8 )` |
| `queue` / `stack` | ✅ | `[ 1 | 2 | 3 ]` / `[ 10 | 20 ]` |
| 递归栈帧 | ✅ | 多层帧 + 地址随深度递增 |
| 循环折叠 | ✅ | **周期检测**（不是"连续同行"）：40 次循环 84 步 → 1 段「×40」 |
| 变化摘要（diff） | ✅ | 顶部 chip `s: 1 → 3` |
| 变量轨迹图 | ✅ | sparkline：`s` 加速上升，`i` 直线 |
| 递归调用树 | ✅ | `main → fib(int) n=4 → n=3 → n=2 → n=1×2` |
| 程序输出 | ✅ | 只在最后一步显示（防剧透） |
| 编译错误 | ✅ | 行号标红 + 中文提示 |
| 编译超时 | ✅ | 弹窗（10s） |
| TLE / 崩溃 | ✅ | 截断保留 trace；段错误识别 `EXC_BAD_ACCESS` |
| 类型名归一化 | ✅ | `map<string, int>` / `queue<int>` / `set<int>` |

**实测数据**：启动 ~1.6s + **约 3ms/步**；5000 步 ≈ 17s。

---

## 4. bug 账（B1/B2 已修，B3 剩余）

### B1 · 声明步守卫按 depth 记账，递归下张冠李戴（✅ 已修，T-1）
原报"`_cur_depth` 少了 `global`"只是表层：模块级 `_cur_depth` 恒为 0 确实会让
`_frame_vars` 统一按"深度 0"取 `_prev_vars`，但补上 `global` 也**不能**修好——真正
的根因是**守卫表按帧序号 depth 记账**，而递归压栈时所有旧帧的 depth 都会 +1：
新帧继承父帧的"已见变量"集合 → 守卫被跳过，未构造的 `std::map` 被当已构造读
（实测幽灵 `size: 1876945921` 的假元素），父帧反而误显示"声明中"。
修法（`tracer/tracer.py`）：`_frame_key()` 用 `frame.GetCFA()`（canonical frame address）作键；
`_dump_frames` 收尾删掉本步已不在栈上的键 → 返回后复用同一栈地址的新调用从空集开始。
派单与验收：`orders/T1-b1-frame-guard.md` → `orders/T1b-frame-key-cfa.md`（GetFP 在叶子函数里会撞车，已改 GetCFA）。

### B2 · opaque 节点 value 是空串（✅ 已修，真因是 stdout 编码）
现象：守卫产出的 `"value": "（声明中，下一步展开）"` 到 trace 里变成 `""`。
真因：**不是守卫的问题**。Java 的 `LldbEngine` 起 lldb 时设了 `LC_ALL=C`，
LLDB 内嵌 Python 的 `sys.stdout` 于是变成 **US-ASCII + errors="ignore"**；
`_emit` 里 `json.dumps(..., ensure_ascii=False)` 输出的中文被**静默丢弃**
（不是替换成 `?`，是直接消失），JSON 仍是合法的空串。
复现：同一个 tracer，`LC_ALL=C lldb ...` 出空串，去掉 `LC_ALL=C` 就正常。
修法：把整行编码成 UTF-8 写 `sys.stdout.buffer`，异常时退回 `ensure_ascii=True`。

### B3 · `realpath` 这步是错的方向（剩余，不影响产品）
`bootstrap()` 用 `os.path.realpath` 解析源码路径，本意是修 `/tmp` 符号链接。
但结果是 `_src` 变成 `/private/tmp/xxx.cpp`，而二进制调试信息里是 `/tmp/xxx.cpp` → 断点 0 个。
**产品的 run 目录没有符号链接，所以用户不受影响**，只影响手工在 `/tmp` 下测试。
正确方向：建断点时同时尝试 `abspath` 与 `realpath` 两种路径。

---

## 5. 下一步（按顺序，一单一件事）

### T-1 修 B1 ✅ 已完成（2026-11-24）
- 真根因不是"少个 global"：守卫表按帧序号 depth 记账，递归压栈时旧帧 depth 全部 +1，
  新帧继承父帧"已见集合"→ 未构造容器被当已构造读（幽灵 map `size: 1876945921`），父帧误显"声明中"
- 修法：`_frame_key`（GetCFA）+ `_dump_frames` 收尾清理已出栈的键
- 顺带确认 B2 同源已修（见 §4），T-2 不需要了
- 验收：`./smoke.sh` PASS；递归+map 专项 18 步无幽灵 size；`tests/calltree_trace_test.js` PASS

### T-2 ~~若 B2 仍在，专项排查~~ ✅ 已取消
B2 真因已定位（`LC_ALL=C` → 内嵌 Python 丢弃非 ASCII，见 §4），无需包装器。

### T-3 优化候选（按价值排序）
1. **指针箭头视觉增强** ✅ 已完成（2026-11-24，T-3.1）
   - `stroke-width` 1.5→2.4、opacity .85→.95、marker 7→9px、青/紫提亮、标签加暗色描边
   - 曲线外扩 `R+14`→`R+24`，44px 边距里不再像小钩子
   - 新增内置示例「指针 swap」（`app.js` SAMPLES + 下拉项，8 步）：两条跨帧箭头，实测 `ptrDrawn=2 / ptrMiss=0`
   - 验收：无头 Chrome 截图 + DOM 指标（stroke 2.4px / marker 9 / drawn 2）+ `smoke.sh` PASS
2. **`}` 行高亮** ✅ 已完成（2026-11-24，T-3.2）
   - `editor.js` 新增 `describeBraces()`：大括号栈 + 构造识别（for/while/do/if/else/switch/struct/class/namespace/函数）
   - 播放时显示 `← for 循环（第 6 行）` 这类归属提示；只对"整行只有 `}`/`};`"生效
   - 扫描前剥掉字符串/字符字面量与 `//`、`/* */` 注释，`printf("}")` 不会打乱栈
   - 新增 `tests/brace_hint_test.js`（10 组用例）并接入 `smoke.sh`；无头浏览器实测第 8 行提示
3. **压栈动画** ✅ 已完成（2026-11-24，T-3.3）
   - 帧数变多（压栈）：新的最内层帧 `.frame-in` 从上方 14px 滑入 + 淡入（220ms）
   - 帧数变少（返回）：回到的那一帧 `.frame-return` 边框绿色脉冲（400ms）
   - 只在帧数变化的那步触发；首帧不动画；`prefers-reduced-motion` 下关闭
   - SVG 根加 `data-frame-anim="in|return|none"` 便于验收；实测 push/pop/同帧数三态正确
4. **`~/.cppviz/runs/` 清理策略**：现在保留 30 份，可加"清空"按钮
5. **stdin 多组测试数据**（M3 遗留）
6. **TLE 回放最后 200 步**（M3 遗留）

---

## 6. 关键决策（已定，不再讨论）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 默认步数预算 | 5000（UI 可调，上限 20000） |
| D2 | 语法高亮 | 自写正则，不引 CodeMirror |
| D3 | 编辑器 | 两态切换（编辑=textarea / 回放=高亮 div），不做覆盖层 |
| D5 | 界面语言 | 中文；**不做内嵌浏览器窗口**，用系统浏览器 |
| D6 | 构建 | 无 Maven/Gradle，`javac` + `build.sh` |
| D7 | 调试器 | macOS 用 LLDB（gdb 在 macOS 要 codesign） |
| D8 | 内存图 | SVG，不是 Canvas |
| D10 | 请求体 | `application/x-www-form-urlencoded`；Json 只做序列化，不写解析器 |
| D12 | 不做打包 | 用户明确要求（2026-11-24） |
| D13 | 容器展开 | 必须靠"**声明步不读守卫**"（K31），否则未构造的 `std::map` 会让 formatter 死循环 |

---

## 7. 进度日志（倒序，每条 ≤5 行）

### 2026-11-24 · T-3.3 压栈/返回过渡（v2.1.3）
- 压栈：最内层帧滑入淡入 220ms；返回：回到的帧绿色描边脉冲 400ms
- 仅在帧数变化时触发，首帧不动画，`prefers-reduced-motion` 关闭
- 验收：`smoke.sh` PASS（22:09）；无头 Chrome 三态 `in/return/none` 全对；
  动画冻结在 100ms 截图（opacity 0.63）与返回帧 stroke 实测 `rgb(58,143,97)`

### 2026-11-24 · T-3.2 `}` 归属提示（v2.1.2）
- `editor.js` 加大括号栈 + 构造识别；提示变成 `← for 循环（第 6 行）`
- 剥字符串/注释再数括号（`printf("}")`、`/* } */` 不再干扰）；单行块不提示
- 新增 `tests/brace_hint_test.js` 并接入 smoke；`smoke.sh` PASS（22:05）
- 坑：前端资源由 `build.sh` 拷进 `out/classes`，改了 src 不重建会看到旧页面（K41）

### 2026-11-24 · T-3.1 指针箭头增强 + swap 示例（v2.1.1）
- 箭头 1.5→2.4px、marker 7→9、青/紫提亮、标签描边、曲线外扩 14→24px
- 新增「指针 swap」示例：跨帧两条箭头，`ptrDrawn=2 / ptrMiss=0`，8 步无垃圾值
- **T-1 修正**：守卫键 `GetFP()`→`GetCFA()`（叶子函数会复用调用者 frame record，FP 撞车）
- 验收：`smoke.sh` PASS（22:01）；calltree 测试 PASS；无头 Chrome 截图比对

### 2026-11-24 · T-1：修 B1，定位 B2 真因（v2.1）
- B1 真根因是"守卫按 depth 记账"，不是缺 global：递归下新帧继承父帧已见集 → 幽灵 map
- 修法：GetCFA 作键 + 每步清理已出栈帧；B2 真因：`LC_ALL=C` 下内嵌 Python 静默丢弃中文
- 验收：`smoke.sh` PASS（2026-11-24 21:51）；递归/map 专项 18 步全对；calltree 测试 PASS
- 下一步：T-3（等用户说"继续优化"）

### 2026-11-24 · 交接（v2.0）
- 完成：类型名归一化（`map<string, int>` 等）、opaque 渲染修复（前端侧）、递归调用树
- 未完成：B1 `_cur_depth` 缺 global、B2 opaque 空值、B3 realpath 方向
- 上轮基线：`smoke.sh` PASS，代码 3708 行
- 下一步：T-1

---

## 8. Token 账

| 阶段 | 净内容 | 原始（×3） |
|---|---|---|
| 需求 + 设计 + M0/M1 | ≈0.55M | ≈1.8M |
| 图形化 + 任意代码 + STL | ≈0.75M | ≈2.2M |
| 折叠 + diff + 轨迹 + 调用树 | ≈0.30M | ≈0.5M |
| T-1 修 B1 / 定位 B2 | ≈0.04M | ≈0.12M |
| T-3.1 箭头 + 示例 | ≈0.03M | ≈0.09M |
| T-3.2 `}` 归属提示 | ≈0.03M | ≈0.09M |
| T-3.3 压栈动画 | ≈0.02M | ≈0.06M |
| **累计** | **≈1.72M** | **≈4.9M** |

**省 token 的关键**：本文件（≈3k token）替代聊天历史（几十 k）；派单前只读 §1/§4/§5 与相关坑。
