# 安装指南

安装包在 **[Releases](https://github.com/yuehanGuan/c-visual/releases/latest)**。

- macOS：`c-visual-<版本>.dmg`
- Windows：`c-visual-windows.zip`

> 需要本机有 C++ 工具链：macOS 用 Xcode Command Line Tools，Windows 用 LLVM。
> **Java 不用装**，已经打包在安装包里。

---

## macOS

### 1. 下载并安装

1. 下载 `c-visual-<版本>.dmg`
2. 双击打开，把 **c可视** 拖进「应用程序」
3. 弹出确认时选「替换」（升级时）

### 2. 第一次打开：绕过 Gatekeeper

第一次双击会看到：

> **"c可视" 无法打开，因为 Apple 无法验证 "c可视" 是否包含可能危害 Mac 安全或泄漏隐私的恶意软件。**

这是 macOS 对**未签名应用**的统一拦截，不是程序损坏，也不是病毒。原因：签名需要 Apple 开发者证书（$99/年），当前安装包没有签名/公证。

点「完成」（**不要**点「移到废纸篓」），然后二选一：

**方法 A：系统设置（推荐）**

1. 打开 **系统设置 → 隐私与安全性**
2. 滚到最下面「安全性」区域
3. 看到「c可视 已被阻止…」→ 点 **「仍要打开」**
4. 输入密码或 Touch ID
5. 再弹一次确认 → 点「打开」

**方法 B：终端**

```bash
xattr -dr com.apple.quarantine "/Applications/c可视.app"
open "/Applications/c可视.app"
```

`xattr` 只是去掉"从网上下载"的隔离标记，等价于在系统设置里点「仍要打开」。

> 只有第一次需要这样做；之后双击就直接打开。

### 3. 验证安装

1. 菜单栏出现 **c可视**，浏览器自动打开页面
2. 选「示例：读入求和」→ 运行 → 输出 `6`、标题右侧 `✓ 输出一致`
3. 左栏「历史运行」能看到这次运行

### 4. 卸载

```bash
# 退出应用后
rm -rf "/Applications/c可视.app"
rm -rf ~/.cppviz            # 运行记录 + tracer（可选）
```

### 5. 升级

下载新版本 dmg → 拖进「应用程序」→ 选择「替换」。运行记录（`~/.cppviz`）会保留。

---

## Windows

### 1. 安装 LLVM

c可视 需要 `clang++.exe` 编译、`lldb.exe` 调试：

1. 打开 <https://github.com/llvm/llvm-project/releases>
2. 下载 `LLVM-<版本>-win64.exe`
3. 安装时勾选 **Add LLVM to the system PATH for all users**
4. 装完打开新的命令行，确认：

```powershell
clang++ --version
lldb --version
```

### 2. 解压并运行

1. 下载 `c-visual-windows.zip`，解压到任意目录（不要在压缩包里直接运行）
2. 双击 `c-visual\c-visual.exe`
3. 若 **SmartScreen** 拦截（"Windows 已保护你的电脑"）：点「更多信息」→「仍要运行」

### 3. 验证安装

1. 浏览器自动打开页面
2. 示例「读入求和」→ 运行 → `6` + `✓ 输出一致`
3. 顶部没有「缺少 clang++ / lldb」的环境条

### 4. 卸载

删除解压出来的 `c-visual` 文件夹，再删除 `C:\Users\<你>\.cppviz`（运行记录，可选）。

---

## 常见问题

**提示「"c可视" 已损坏，无法打开」**
说明隔离标记还在：终端执行 `xattr -dr com.apple.quarantine "/Applications/c可视.app"`；如果还不行，重新下载一次。

**系统设置里找不到「仍要打开」**
先双击一次应用（触发拦截），再打开系统设置 → 隐私与安全性，往下滚到底部。

**浏览器没有自动打开**
c可视 启动后会打印端口；在终端里看：

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep c可视
```

然后手动打开 `http://127.0.0.1:<端口>/`。

**顶部出现「缺少 clang++ / lldb」**

- macOS：点「帮我安装」，会调起 Xcode 命令行工具安装
- Windows：装 LLVM 并把它加进 PATH，然后重开 c可视

**程序一直「运行超时」**
可能是死循环；把工具条「步数上限」调小（默认 5000）再试。

**代码/输入没有保存**
代码、输入、期望输出保存在浏览器本地；固定端口之后，同一台机器重开应用会保留。
运行记录保存在 `~/.cppviz/runs`（Windows 为 `C:\Users\<你>\.cppviz\runs`）。

---

## 从源码运行（开发者）

```bash
git clone https://github.com/yuehanGuan/c-visual.git
cd c-visual
./run.sh       # 构建 + 启动 + 打开浏览器
./smoke.sh     # 全链路验收，最后一行必须是 PASS
```

需要 JDK 21。打包：`./package.sh`（macOS）/ `./package.ps1`（Windows）。
