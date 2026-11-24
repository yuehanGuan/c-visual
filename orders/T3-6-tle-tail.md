【T-3.6】截断运行定位到最后 200 步 + 10× 回放（只改 2 个文件，共 3 处）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 只读 `app.js` 的 `handleResult` 与 `index.html` 的速度下拉；不读 DEVLOG/PLAN。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `node --check` 与 `./build.sh`。

## 目标
步数预算被耗尽（`result.truncated`）时：自动跳到「总步数 − 200」那一步（循环重复段），
并把播放速度切到 10×（45ms/步），banner 里说明；正常运行仍然从第 1 步开始。

## 第 1 次调用：read 两段
- `app.js` 的 `async function handleResult(result)` 全段
- `index.html` 第 83–91 行（速度下拉）

## 第 2 次调用：edit #1 —— index.html 速度下拉加 10×
原文：
```
      <option value="90">5×</option>
    </select>
```
改为：
```
      <option value="90">5×</option>
      <option value="45">10×</option>
    </select>
```

## 第 3 次调用：edit #2 —— app.js 的 banner 文案
原文：
```
    } else if (result.truncated) {
      showBanner('程序执行超过步数上限，记录已截断。可以调大步数上限再看。', true);
    }
```
改为：
```
    } else if (result.truncated) {
      showBanner('程序执行超过步数上限，记录已截断。已定位到最后 200 步，可按 10× 回放。', true);
    }
```

## 第 4 次调用：edit #3 —— app.js 末尾的 `goTo(0)`
原文：
```
    CppEditor.setMode('play');
    el.editBtn.classList.remove('hidden');
    goTo(0);
  }
```
改为：
```
    CppEditor.setMode('play');
    el.editBtn.classList.remove('hidden');
    /* A truncated run means the step budget ran out: land on the tail where
     * the repeating pattern is visible, and replay at 10x (45ms per step). */
    if (result.truncated && state.steps.length > 200) {
      el.speed.value = '45';
      goTo(state.steps.length - 200);
    } else {
      goTo(0);
    }
  }
```

## 第 5 次调用：检查（只允许这两条）
```
node --check src/main/resources/web/app.js     → 无输出、退出码 0
./build.sh                                      → 期望 build ok
```

## 收工
总结 ≤2 行：3 处是否完成、两条检查结果。不要写别的。
