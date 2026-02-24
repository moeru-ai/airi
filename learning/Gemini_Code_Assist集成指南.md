# Gemini Code Assist 集成指南

## 什么是 Gemini Code Assist？

Gemini Code Assist 是 Google 推出的 AI 编程助手，提供两种使用方式：

| 版本 | 使用场景 | 限制 |
|------|----------|------|
| **个人版** | 个人开发者 | 每天 33 次 PR 审查 |
| **企业版** | 团队/组织 | 100+ 次 PR 审查，支持私有代码库索引 |

### 核心功能

1. **IDE 内代码补全** - VS Code / IntelliJ 插件
2. **GitHub PR 自动审查** - 自动分析代码并提供改进建议
3. **代码自定义** - 基于团队代码库的定制化建议（企业版）

---

## 开启 GitHub PR 自动审查

### 步骤 1：安装 GitHub App

1. 访问 [Gemini Code Assist 应用页面](https://github.com/apps/gemini-code-assist)
2. 登录 GitHub 账户
3. 点击 **Install** 按钮
4. 选择要安装的组织或个人账户
5. 选择允许访问的仓库（可全选或指定仓库）

### 步骤 2：配置仓库（可选）

在仓库根目录创建 `.gemini/` 文件夹，添加配置文件：

```
your-repo/
├── .gemini/
│   ├── config.yaml      # 功能开关和忽略规则
│   └── styleguide.md    # 代码风格指南
└── ...
```

### 步骤 3：触发审查

创建 Pull Request 后，Gemini 会自动：
- 生成 PR 摘要
- 分析代码变更
- 提供改进建议

也可以在 PR 评论中使用 `/gemini` 手动触发审查。

---

## 配置文件详解

### config.yaml - 功能配置

```yaml
# 忽略特定文件或目录（支持 glob 模式）
ignore_patterns:
  - packages/i18n/src/**      # 忽略国际化文件
  - "**/*.generated.ts"       # 忽略生成的文件
  - "**/dist/**"              # 忽略构建产物

# 功能开关（企业版支持）
features:
  code_review: true           # 启用代码审查
  security_analysis: true     # 启用安全分析
```

**本项目的配置**：
```yaml
ignore_patterns:
  - packages/i18n/src/**
```
- 忽略国际化包源码，避免 AI 分析自动生成的翻译文件

### styleguide.md - 代码风格指南

定义 Gemini 在审查时应遵循的编码规范和输出格式：

```markdown
# Gemini Code Assist Style Guide

## 核心要求

**所有代码建议必须使用 GitHub suggestion 块包裹**，便于维护者一键应用。

## 格式规范

使用 GitHub 的 suggestion 语法：

```suggestion
// 你的代码建议
```

## 多方案展示

提供多个方案时，使用独立标注的 suggestion 块：

**Option A - 性能优先：**

```suggestion
function processItems(items) {
  let result = 0;
  for (const item of items) {
    result += item.value;
  }
  return result;
}
```

**Option B - 函数式风格：**

```suggestion
const processItems = (items) =>
  items.reduce((sum, item) => sum + item.value, 0);
```
```

---

## 代码审查重点

默认情况下，Gemini Code Assist 会从以下维度审查代码：

| 类别 | 审查内容 |
|------|----------|
| **Correctness（正确性）** | 逻辑错误、边界条件、类型问题 |
| **Efficiency（效率）** | 性能瓶颈、算法优化、资源使用 |
| **Maintainability（可维护性）** | 代码结构、命名规范、注释完整性 |
| **Security（安全性）** | 漏洞检测、敏感信息泄露、权限问题 |
| **Miscellaneous（其他）** | 最佳实践、文档、测试覆盖 |

---

## 配置优先级

当存在多个配置源时，优先级如下：

```
仓库 .gemini/config.yaml  >  Google Cloud Console 配置
仓库 .gemini/styleguide.md + Google Cloud Console 风格指南（合并）
```

- `config.yaml`：仓库配置优先
- `styleguide.md`：多个来源合并应用

---

## 实际工作流程

```
┌─────────────────────────────────────────────────────────────┐
│  开发者提交 Pull Request                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Gemini Code Assist 自动触发                                 │
│  ├── 读取 .gemini/config.yaml（排除指定文件）                 │
│  ├── 读取 .gemini/styleguide.md（应用风格指南）               │
│  └── 分析代码变更                                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  在 PR 中发布审查结果                                        │
│  ├── PR 摘要（变更概述）                                     │
│  └── 代码建议（GitHub suggestion 格式）                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  维护者可一键应用建议                                        │
│  → 点击 "Commit suggestion" 直接合并                         │
└─────────────────────────────────────────────────────────────┘
```

---

## IDE 插件安装

### VS Code

1. 打开扩展面板 (`Ctrl`/`Cmd` + `Shift` + `X`)
2. 搜索 "Gemini Code Assist"
3. 点击安装
4. 重启 VS Code
5. 登录 Google 账户授权

### IntelliJ IDEA

1. 打开 `Settings > Plugins`
2. 搜索 "Gemini Code Assist"
3. 安装并重启 IDE
4. 登录 Google 账户

---

## 企业版额外功能

企业版支持代码定制化（Code Customization）：

1. **私有代码库索引** - 连接内部仓库，学习团队代码风格
2. **统一风格管理** - 在 Google Cloud Console 集中管理多仓库配置
3. **增强隐私控制** - 代码不出企业边界

**所需 IAM 权限**：
- `Service Usage Admin`
- `geminicodeassistmanagement.scmConnectionAdmin`
- `Code Repository Indexes Admin`
- `Gemini for Google Cloud User`

---

## 本项目配置示例

本项目已配置 Gemini Code Assist：

```
.gemini/
├── config.yaml     # 忽略 i18n 自动生成文件
└── styleguide.md   # 要求使用 GitHub suggestion 格式输出建议
```

**设计意图**：
- 避免审查机器生成的翻译文件
- 确保建议格式统一，便于维护者快速应用

---

## 相关链接

- [Gemini Code Assist 官方文档](https://developers.google.com/gemini-code-assist/docs/overview)
- [GitHub 集成设置](https://developers.google.com/gemini-code-assist/docs/set-up-code-assist-github)
- [自定义行为配置](https://developers.google.com/gemini-code-assist/docs/customize-gemini-behavior-github)
- [代码定制化指南](https://developers.google.com/gemini-code-assist/docs/code-customization)

---

## 与其他 AI 工具对比

| 工具 | 配置目录 | 集成平台 | 主要用途 |
|------|----------|----------|----------|
| **Gemini Code Assist** | `.gemini/` | GitHub PR | 自动化代码审查 |
| **GitHub Copilot** | `.github/copilot-instructions.md` | VS Code/IDE | 代码补全 |
| **Qoder** | `.qoder/` | Qoder IDE | AI 编程助手 |
| **Cursor** | `.cursorrules` | Cursor IDE | AI 编程助手 |

每个工具可独立使用，也可组合使用以覆盖不同开发场景。
