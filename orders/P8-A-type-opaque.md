【P8-A】类型名归一化 + opaque 显示修复（改 2 个文件，各一处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 不读 DEVLOG；每次工具调用 ≤30 行；总结 ≤2 行。

## 问题 1（tracer/tracer.py 的 `_short_type`）
界面上的类型名被截断成 `map<string,…`、`set<int, le…`、`queue<int, …`、`pair<int, i…`，
因为模板参数里带 `less<>` / `allocator<>` / 底层容器。
`_short_type` 现在只剥了 `allocator<...>`，要把这些也剥掉：

1. 复用现有的 `_drop_allocator` 逻辑，扩展成"按名字剥某个模板"：
   要剥的参数名集合：`allocator`、`less`、`greater`、`hash`、`equal_to`、`char_traits`
2. **额外规则**：若类型名以 `queue<` 或 `stack<` 开头，只保留**第一个**模板参数，
   即 `queue<int, deque<int>>` → `queue<int>`，`stack<int, vector<int>>` → `stack<int>`
3. 剥完仍要把 `" >"` 收成 `">"`（现在已有这步，保留）

预期结果：
- `map<string, int, less<string>>` → `map<string, int>`
- `set<int, less<int>>` → `set<int>`
- `queue<int, deque<int>>` → `queue<int>`
- `pair<int, int>` → `pair<int, int>`（不变）
- `vector<int>` → `vector<int>`（不变）

## 问题 2（memory.js 的 opaque 渲染）
现在 opaque 节点一律显示 `类型 （不支持的类型）`，把节点自带的 `value` 盖掉了。
例：未初始化的 `int r`，trace 里是 `{"kind":"opaque","type":"int","value":"（声明中，下一步展开）"}`，
界面却显示 `int （不支持的类型）`。
改法：opaque 分支优先显示节点自带的 `value`；`value` 为空或不存在时，才显示 `（不支持的类型）`。

## 自测
```
cd /Users/han./Documents/deepseek-harness/default-workspace/cppviz
./build.sh && ./smoke.sh | tail -2
```
然后跑 samples/stl.cpp 与 samples/qs.cpp，确认界面类型名变成
`map<string, int>` / `set<int>` / `queue<int>` / `stack<int>`，不再是 `map<string,…`。
再跑 samples/recursion.cpp，确认 `main` 的 `r` 显示 `（声明中，下一步展开）` 而不是 `（不支持的类型）`。

## 收工
总结 2 行：写出 stl 与 qs 的实际类型名显示。
