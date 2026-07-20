---
title: 配置聊天模型
description: 为 AIRI 配置聊天服务商和模型
---

聊天模型是 AIRI 的“大脑”。完成本页后，AIRI 可以生成文字回复。你需要一个支持聊天功能的服务商账户，或一个已运行的本地模型服务。

## 前提条件

* 已安装并启动 AIRI。
* 云端服务商：已创建 API Key，并确认账户可以使用聊天模型。
* 本地服务：模型服务已经启动，且 AIRI 所在设备可以访问它。

## 步骤

1. 打开 **设置 → 服务商 → 聊天**，选择你要使用的服务商。

   不确定选哪个时，可先从已有的详细指南中选择：[OpenRouter](./providers/consciousness/openrouter.md)、[DeepSeek](./providers/consciousness/deepseek.md)、[OpenAI 兼容 API](./providers/consciousness/openai.md)，或本地的 [Ollama](./providers/consciousness/ollama.md)。完整列表见[支持的服务商目录](./providers/catalog.md)。

2. 填写 API Key。若服务商提供了专用的 API 地址，再在高级设置中填写 Base URL；否则保留默认值。

3. 点击 **Ping API**，测试网络是否连通以及 API Key 是否填写正确。

4. 网络通畅后，点击 **选择模型**；也可以打开 **设置 → 意识**，选择刚配置的聊天服务商和模型。

   AIRI 会在服务商支持时加载模型列表。列表无法加载时，可根据服务商官方文档手动输入精确的模型 ID。

5. 返回聊天界面，发送一条简短消息，例如“你好”。收到回复即表示配置成功。

## 排查

### 验证通过，但没有可选模型

先确认服务商允许列出模型。部分服务商不提供模型列表，或该 API Key 没有相应权限；这时在“意识”页面手动输入模型 ID 即可。模型 ID 必须与服务商文档完全一致。

### 验证失败或请求超时

检查 API Key、Base URL、账户额度和网络连接。对于本地服务，确认服务正在运行，并且 Base URL 不是只允许其他设备访问的地址。

### AIRI 没有回复

确认“意识”页面同时选中了服务商和模型。仅保存服务商凭据不会自动启用它。

## 下一步

聊天功能正常后，可继续[配置语音输入与输出](./audio.md)，让 AIRI 说话并使用麦克风输入。
