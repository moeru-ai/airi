---
title: OpenAI（和兼容 API）
description: 在 AIRI 中配置 OpenAI 兼容服务商作为大模型服务商
is_openai_compatible: true
---

本文档介绍了如何在 AIRI 中配置 OpenAI 兼容服务商作为大模型服务商。由于此类提供商原生支持 OpenAI 格式的 API，配置过程非常标准且直接。

::: info 如何确定我的大模型提供商是否使用的是 OpenAI 兼容 API？
如果其 API 地址以 "/v1" 结尾并且 API Key 以 "sk-" 开头，则大概率这个提供商使用的是 OpenAI 兼容 API。如果你无法找到你的大模型提供商，但其 API 地址和 API Key 遵循以上格式，则可以在 AIRI 中用这个提供商试试看。
:::

## 第一步：获取 API Key

1. 登录 [OpenAI 兼容服务商 管理控制台](你的服务商控制台地址)。
2. 找到 API 密钥菜单并生成你的 API Key。
3. 选择一个你记得住的 API 名称（比如 "AIRI-Default"），并配置其他选项，如过期时间、总额度等。
4. 点击 **“添加/创建 API 密钥” (Add/Create API Key)**，并点击生成的密钥右侧的复制图标。通常 API 密钥会以 "sk-" 开头。

    ::: warning 安全提醒

    **API 密钥** 等同于你的账号密码。请勿告诉他人你的 API Key，或在任何公开场合展示，以防额度被他人盗刷。
    :::

::: info
确保你的账户里有充值余额，或有开通相关自动扣费服务，否则 API 调用会返回 402 或 429 报错。
:::


## 第二步：输入 API 信息

请在 AIRI 的 **设置 -> 服务来源 -> 聊天 -> OpenAI 兼容 API** 页面中按以下说明填写：

### 1. 基础设置 (Basic)
* **API 密钥**: 填入你在 OpenAI 兼容服务商后台生成的 API 密钥。
    * *提示：点击右侧的刷新图标可以清空输入。*

### 2. 高级设置 (Advanced)
点击 **Advanced** 箭头展开隐藏选项：
* **Base URL**: `提供商提供的接口地址`。默认情况下不需要更改。

### 3. 配置校验 (Validation)
填写完成后，你会看到底部的蓝色通知栏：
1.  **Ping API**: 点击此按钮测试网络是否连通以及 API 密钥是否填写正确。
2.  **选择模型**: 测试成功后，点击此处选择你想要使用的具体模型（如 `你想使用的模型名称`）。

---

## 开发者快速参考 (Developer Quick-Start)

如果你需要手动测试 OpenAI 兼容服务商的 API 连通性，可以使用以下 cURL 命令进行调试：

```bash
curl <提供商提供的接口地址>/chat/completions \
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
