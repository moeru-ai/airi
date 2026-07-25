---
title: Discord 机器人
description: 使用 Discord 应用与模型服务运行 AIRI 语音和消息机器人
---

Discord 机器人连接 Discord 服务器中的消息和语音频道，并使用配置的模型服务生成回复。

## 前提条件

* 已在仓库根目录安装依赖：**pnpm i**。
* 在 [Discord Developer Portal](https://discord.com/developers/home) 创建应用和 Bot。
* 在 Bot 设置中启用 **Server Members Intent** 与 **Message Content Intent**。
* 已准备聊天模型和语音服务的凭据。

::: warning 凭据安全
Discord Bot Token、Client ID 和模型 API Key 只应保存在本地 **.env.local** 文件中。不要提交、截图或发送这些配置。
:::

## 配置

~~~bash
cp services/discord-bot/.env services/discord-bot/.env.local
~~~

编辑 **services/discord-bot/.env.local**，填写 **DISCORD_TOKEN**、**DISCORD_BOT_CLIENT_ID**、聊天模型与语音服务配置。Discord Token 丢失或泄露时，应立即在开发者控制台重置。

## 启动

~~~bash
pnpm -F @proj-airi/discord-bot start
~~~

## 注意事项

邀请机器人加入服务器前，确认应用权限仅覆盖所需的频道和能力。不要将 Bot Token 或其他服务凭据提交到仓库。
