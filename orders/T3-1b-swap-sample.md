【T-3.1b】补一个"指针 swap"示例（只改 2 个文件，各 1 处插入）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `src/main/resources/web/app.js` 的 SAMPLES 末尾、`src/main/resources/web/index.html` 第 16–20 行。
⚠️ 不要跑 lldb / smoke.sh；只允许 `node --check src/main/resources/web/app.js`。
✅ 示例代码已实测：8 步、两条指针箭头、无垃圾值，照抄即可。

## 第 1 次调用：read 两个片段（app.js 的 `recursion: \`...\`,` 到 `};`；index.html 第 16–20 行）

## 第 2 次调用：edit #1 —— app.js：在 `recursion` 条目之后插入 `swap` 条目
定位（`recursion` 模板字符串结束后、`  };` 之前）：
```
    printf("%d\\n", r);
    return 0;
}
`,
  };
```
改为（注意：C++ 里的换行要写成 `\\n`，与文件里现有写法一致）：
```
    printf("%d\\n", r);
    return 0;
}
`,
    swap: `#include <cstdio>

void swap2(int *p, int *q) {
    int t = *p;
    *p = *q;
    *q = t;
}

int main() {
    int a = 7, b = 9;
    swap2(&a, &b);
    printf("%d %d\\n", a, b);
    return 0;
}
`,
  };
```

## 第 3 次调用：edit #2 —— index.html：在递归示例后加一行
原文：
```
      <option value="recursion">示例：递归 fib</option>
```
改为：
```
      <option value="recursion">示例：递归 fib</option>
      <option value="swap">示例：指针 swap</option>
```

## 第 4 次调用：检查（只允许这一条）
```
node --check src/main/resources/web/app.js     → 期望：无输出，退出码 0
```

## 收工
总结 ≤2 行：两个插入是否完成、node --check 结果。不要写别的。
