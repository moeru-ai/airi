---
title: LM Studio（本地模型）
description: 使用本地 LM Studio 服务为 AIRI 配置聊天模型
---

LM Studio 可以在本机运行模型并提供本地 API。它适合希望在自己的设备上运行模型的用户；默认情况下不需要 API Key。

::: info 为什么选择 LM Studio？
如果你希望在本机运行模型并自行管理模型文件，LM Studio 是不依赖云端 API Key 的选择。
:::

## 第一步：启动本地服务

1. 在 LM Studio 中下载并加载一个聊天模型。
2. 打开 **Local Server**，启动本地服务器。
3. 如果 AIRI 无法访问本地服务，请在 LM Studio 的服务器设置中启用 CORS。

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 聊天 → LM Studio**。
2. 保留默认 Base URL：`http://localhost:1234/v1/`。
3. 如你的 LM Studio 服务需要鉴权，再填写 API Key；否则留空。

### 3. 配置校验

1. **Ping API**: 点击此按钮测试 AIRI 能否连接本地服务。
2. **选择模型**: 测试成功后，点击此处选择已加载的模型。

## 排查

无法连接时，先确认 Local Server 正在运行，且端口与 Base URL 一致。若 AIRI 与 LM Studio 不在同一设备，使用可从 AIRI 设备访问的局域网地址，并仅在可信网络中开放该服务。
