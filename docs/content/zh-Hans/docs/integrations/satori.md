---
title: Satori 机器人
description: 通过 Satori 协议和 Koishi 桥接多个消息平台
---

Satori 机器人通过 Koishi 的 Satori 服务接入 QQ、Telegram、Discord、Lark 等消息平台。当前独立运行的核心是过渡实现，适合实验和维护，不应被视为稳定的 AIRI Core 集成。

## 前提条件

* 已在仓库根目录安装依赖：**pnpm i**。
* 已运行启用 **server-satori** 插件的 Koishi 实例。
* 支持 OpenAI 兼容接口的模型服务。

::: warning 凭据安全
Satori Token、消息平台凭据和模型 API Key 只应保存在本地 **.env.local** 文件中。不要提交、截图或发送这些配置。
:::

## 配置

~~~bash
cp services/satori-bot/.env services/satori-bot/.env.local
~~~

编辑 **services/satori-bot/.env.local**，填写 **SATORI_WS_URL**、**SATORI_API_BASE_URL**、可选的 **SATORI_TOKEN**，以及 LLM 的地址、密钥和模型。

## 启动

~~~bash
pnpm -F @proj-airi/satori-bot dev
~~~

## 注意事项

消息平台连接地址、令牌和模型凭据都属于敏感配置，不要提交 **.env.local** 或将其内容发送给他人。
