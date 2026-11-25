【T-7.1】把"输入数据"做成显眼入口 + 自带输入的示例（改 index.html + app.js，共 6 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `index.html` 的 samples/输入面板、`app.js` 的 SAMPLES 与 samples 事件/深链处理；不读别的。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。
✅ 已实测：scanf / cin 读 stdin 都正常（输入 `3 / 1 2 3` → 输出 6）。

## 目标
用户以为"竞赛输入做不到"，其实 stdio 面板一直有。要做：
① 输入面板默认展开、改名「输入数据（stdin）」；
② 新增内置示例「读入求和」，选中时自动填好示例输入。

## 第 1 次调用：read 四段
- `index.html` 的 `<select id="samples">` 与 `<details class="io">` 段
- `app.js` 末尾的 `SAMPLES`（`swap:` 条目之后到 `};`）
- `app.js` 的 `el.samples.addEventListener('change', ...)`
- `app.js` init 里 `if (sample && SAMPLES[sample]) { ... }`

## 第 2 次调用：edit #1 —— index.html：面板默认展开 + 改名
原文：
```
    <details class="io">
      <summary>测试数据（stdin）</summary>
```
改为：
```
    <details class="io" open>
      <summary>输入数据（stdin）</summary>
```

## 第 3 次调用：edit #2 —— index.html：示例下拉加一项
原文：
```
      <option value="swap">示例：指针 swap</option>
```
改为：
```
      <option value="swap">示例：指针 swap</option>
      <option value="sum">示例：读入求和</option>
```

## 第 4 次调用：edit #3 —— app.js：加示例代码
在 `SAMPLES` 的 `swap: \`...\`,` 条目之后、`  };` 之前插入：
```
    sum: `#include <cstdio>

int main() {
    int n = 0;
    scanf("%d", &n);
    int sum = 0;
    for (int i = 0; i < n; i++) {
        int x = 0;
        scanf("%d", &x);
        sum += x;
    }
    printf("%d\\n", sum);
    return 0;
}
`,
```

## 第 5 次调用：edit #4 —— app.js：示例默认输入表（放在 `const SAMPLES = {` 之前）
```
  /* Samples that need stdin ship a preset so the first run is meaningful. */
  const SAMPLE_STDIN = { sum: '3\n1 2 3' };

```

## 第 6 次调用：edit #5 —— app.js：切示例时填默认输入
原文：
```
      CppEditor.setValue(SAMPLES[el.samples.value] || '');
```
改为：
```
      CppEditor.setValue(SAMPLES[el.samples.value] || '');
      const preset = SAMPLE_STDIN[el.samples.value];
      if (preset !== undefined) {
        el.stdin.value = preset;
        stashStdin();
      }
```

## 第 7 次调用：edit #6 —— app.js：深链进入示例时也填
原文：
```
      CppEditor.setValue(SAMPLES[sample]);
      el.samples.value = sample;
```
改为：
```
      CppEditor.setValue(SAMPLES[sample]);
      el.samples.value = sample;
      const preset = SAMPLE_STDIN[sample];
      if (preset !== undefined) {
        el.stdin.value = preset;
        stashStdin();
      }
```

## 第 8 次调用：检查（只允许这三条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
grep -n "SAMPLE_STDIN" src/main/resources/web/app.js → 至少 3 处
./build.sh                                       → 期望 build ok
```

## 收工
总结 ≤2 行：6 处是否完成、检查结果。不要写别的。
