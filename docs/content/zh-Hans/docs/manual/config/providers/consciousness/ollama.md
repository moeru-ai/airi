---
title: Ollama（本地模型）
description: 使用本地 Ollama 服务为 AIRI 配置聊天模型
---

Ollama 是开源的本地大模型运行框架。它可以在自己的设备上运行模型并提供本地 API，默认不需要 API Key。

::: info 为什么选择 Ollama？
如果你希望在本机运行模型、减少对云端 API 的依赖，或更重视对话数据的本地处理，Ollama 是合适的选择。
:::

## 第一步：安装 Ollama

1. 访问 [Ollama 官网](https://ollama.com/)下载并安装适合自己系统的版本。
2. 在终端（Terminal 或 PowerShell）运行以下命令，确认安装成功：

    ```bash
    ollama --version
    ```

## 第二步：下载并运行模型

1. 在终端执行以下命令下载并启动一个模型：

    ```bash
    ollama run qwen2
    ```

2. 如需使用其他模型，将 `qwen2` 替换为相应的模型 ID。首次下载模型所需时间取决于模型大小和网络环境。

## 第三步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → Ollama**。
2. 保留默认 Base URL：`http://localhost:11434/v1/`；如果 Ollama 运行在其他设备上，填写该设备可访问的地址。
3. 在“意识”中选择 Ollama 与刚才下载的模型。

## 第四步：验证配置

1. **Ping API**：点击此按钮测试 AIRI 能否连接本地服务。
2. **选择模型**：测试成功后，点击此处选择已下载的模型。

## 排查

无法连接时，先确认 Ollama 正在运行，且端口与 Base URL 一致。若 AIRI 与 Ollama 不在同一设备，使用可从 AIRI 设备访问的局域网地址，并仅在可信网络中开放该服务。

::: warning AIRI 无法连接本地 Ollama
如果 Ollama 正在运行但 AIRI 显示网络或 CORS 错误，请按 Ollama 的启动方式设置 `OLLAMA_ORIGINS`，允许 AIRI 的来源访问服务后再重启 Ollama。不要为了排查问题而将本地服务直接暴露到公网。
:::
