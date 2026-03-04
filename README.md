# Project AIRI - AI 助手

Project AIRI 是一个功能强大的 AI 助手项目，支持多种 AI 服务集成，包括国内 AI 服务（如 Kimi、Doubao 等），提供环境管理、API 配置等功能，帮助用户快速搭建和使用 AI 助手。

## 项目特点

- **多平台支持**：支持 Web、桌面（Electron）和移动（Capacitor）平台
- **国内 AI 服务集成**：内置支持 Kimi、Doubao 等国内 AI 服务，确保国内网络环境下的稳定连接
- **环境管理**：自动检查系统环境，识别并安装缺失组件，一键部署功能
- **API 配置**：提供友好的 GUI 界面，支持 API 配置的自动保存和应用
- **多语言支持**：内置国际化支持

## 安装步骤

### 1. 系统要求

- Node.js 18.0.0+（推荐 20.0.0+）
- pnpm 8.0.0+
- Git（可选，用于版本控制）
- 至少 8GB 内存
- 至少 4 核心 CPU

### 2. 安装步骤

#### 步骤 1：克隆项目

```bash
git clone https://github.com/badhope/ai-assistant.git
cd ai-assistant
```

#### 步骤 2：安装依赖

```bash
pnpm install
```

#### 步骤 3：启动开发服务器

##### Web 版本

```bash
pnpm -F @proj-airi/stage-web dev
```

##### 桌面版本

```bash
pnpm -F @proj-airi/stage-tamagotchi dev
```

## 基本操作方法

### 1. 环境检查

1. 打开应用后，进入「设置」页面
2. 点击「环境管理」选项
3. 点击「检查环境」按钮，系统会自动检查 Node.js、pnpm、依赖等环境
4. 如果发现缺失组件，点击「安装缺失组件」按钮进行自动安装
5. 点击「一键部署」按钮，系统会自动完成环境检查、组件安装和项目构建

### 2. API 配置

1. 进入「设置」页面
2. 点击「API 配置」选项
3. 选择 AI 服务提供商（如 Kimi、Doubao 等）
4. 输入 API Key 和 Base URL
5. 点击「测试连接」按钮，验证 API 连接是否正常
6. 点击「保存配置」按钮，保存配置并应用

### 3. 使用 AI 服务

1. 回到主界面
2. 在聊天框中输入问题
3. 点击发送按钮，等待 AI 回复
4. 可以调整 AI 服务提供商和模型设置

## 常见问题解答

### Q1：环境检查失败怎么办？

**A**：如果环境检查失败，系统会显示具体的错误信息。根据错误信息，您可以：
- 手动安装缺失的组件
- 检查网络连接
- 确保系统满足最低要求

### Q2：API 连接失败怎么办？

**A**：API 连接失败可能的原因：
- API Key 错误：请检查您的 API Key 是否正确
- Base URL 错误：请确保 Base URL 格式正确，以 `/` 结尾
- 网络问题：请检查网络连接，确保能够访问 API 服务器
- 服务提供商问题：请检查服务提供商的状态

### Q3：如何切换 AI 服务提供商？

**A**：在「API 配置」页面，选择不同的服务提供商，输入相应的 API Key 和 Base URL，然后保存配置即可。

### Q4：项目构建失败怎么办？

**A**：构建失败可能的原因：
- 依赖问题：尝试重新安装依赖
- 网络问题：确保网络连接正常
- 系统权限：确保有足够的权限

### Q5：如何更新项目？

**A**：使用 Git 更新项目：

```bash
git pull
pnpm install
```

## 技术栈

- **前端**：Vue 3、TypeScript、Pinia、VueUse、UnoCSS
- **桌面**：Electron
- **移动**：Capacitor、Kotlin、Swift
- **构建工具**：Vite、pnpm
- **测试**：Vitest

## 贡献指南

欢迎贡献代码、报告问题或提出建议！请参考项目的 GitHub 仓库获取更多信息。

## 许可证

本项目使用 MIT 许可证。

## 联系方式

- GitHub：[https://github.com/badhope/ai-assistant](https://github.com/badhope/ai-assistant)
- 邮箱：airi@moeru.ai

---

希望本指南能够帮助您快速上手 Project AIRI！如果您有任何问题，请随时联系我们。