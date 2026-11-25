【T-13.2】GitHub Bug 报告模板（新建 .github/ISSUE_TEMPLATE/bug_report.yml，1 个文件）

工作目录：/Users/han./Documents/deepseek-harness/default-workspace/cppviz
⚠️ 新建文件，不读其他文件。
⚠️ **不要跑 lldb / smoke.sh / run.sh**；允许 `ls` 检查。

## 第 1 次调用：新建 .github/ISSUE_TEMPLATE/bug_report.yml（整文件照抄）
```
name: Bug 报告
description: 反馈 c可视 的问题（也可以发邮件到 13076662816@163.com）
title: "[bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        感谢反馈！不想注册 GitHub 的话，可以直接发邮件到 **13076662816@163.com**。
        软件内点工具条「反馈」会自动生成一份带环境信息的报告，复制即可。
  - type: textarea
    id: what
    attributes:
      label: 问题描述
      description: 做了什么、期望什么、实际什么
      placeholder: 例如：运行示例「读入求和」时，输出面板一直显示“程序运行结束后显示”
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: 复现代码
      description: 最小可复现的 C++ 代码
      render: cpp
  - type: textarea
    id: stdin
    attributes:
      label: 输入数据（stdin）
      description: 如果程序需要输入，贴在这里
      render: text
  - type: input
    id: version
    attributes:
      label: c可视 版本
      placeholder: v1.0.0
  - type: input
    id: os
    attributes:
      label: 系统
      placeholder: macOS 14.5 (Apple Silicon) / Windows 11
  - type: textarea
    id: extra
    attributes:
      label: 截图 / 错误信息
      description: 粘贴截图，或红色 banner 的文本
```

## 第 2 次调用：检查
```
ls -l .github/ISSUE_TEMPLATE/
```

## 收工
总结 ≤1 行：是否创建。不要写别的。
