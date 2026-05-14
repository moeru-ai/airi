---
title: NVIDIA NIM
description: 在 AIRI 中配置 NVIDIA NIM 作为大模型服务商
is_openai_compatible: true
---

本文档介绍了如何在 AIRI 中配置 NVIDIA NIM 作为大模型服务商。由于此类提供商原生支持 OpenAI 格式的 API，配置过程非常标准且直接。

::: info 为什么选择 NVIDIA NIM？
由英伟达官方提供，针对自家 GPU 进行了极限优化，微服务架构极其稳定且性能强悍，是企业级应用的标配。
:::

## 第一步：获取 API 密钥

1. 登录你的 [NVIDIA NIM 管理控制台](https://build.nvidia.com/)。
2. 找到 API 密钥 菜单并生成你的 API 密钥。 通常 API 密钥 会以 "sk-" 开头。

    ::: warning 安全提醒

    **API 密钥** 等同于你的账号密码。请勿告诉他人你的 API 密钥，或在任何公开场合展示，以防额度被他人盗刷。
    :::

::: info
确保你的账户里有充值余额，或有开通相关自动扣费服务，否则 API 调用会返回 402 或 429 报错。
:::

## 第二步：输入 API 信息

请在 AIRI 的 **设置 -> 服务来源 -> NVIDIA NIM** 页面中按以下说明填写：

### 1. 基础设置 (Basic)
* **API 密钥**: 填入你在 NVIDIA NIM 后台生成的 API 令牌。
    * *提示：点击右侧的刷新图标可以清空输入。*

### 2. 高级设置 (Advanced)
点击 **Advanced** 箭头展开隐藏选项：
* **Base URL**: `https://integrate.api.nvidia.com/v1`。默认情况下不需要更改。

### 3. 配置校验 (Validation)
填写完成后，你会看到底部的蓝色通知栏：
1.  **Ping API**: 点击此按钮测试网络是否连通以及 API 密钥 是否填写正确。
2.  **选择模型**: 网络通畅后，点击此处选择你想要使用的具体模型（如 `你想使用的模型名称`）。

---

## 开发者快速参考 (Developer Quick-Start)

如果你需要手动测试 NVIDIA NIM 的 API 连通性，可以使用以下 cURL 命令进行调试：

```bash
curl https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "你想使用的模型名称",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```
