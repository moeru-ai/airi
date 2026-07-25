---
title: Telegram 机器人
description: 使用 Telegram Bot、Postgres 与模型服务运行 AIRI 消息机器人
---

Telegram 机器人需要 Telegram Bot Token、Postgres（含 pgvector）和模型服务。它面向从源码运行的集成场景。

## 前提条件

* 已在仓库根目录安装依赖：**pnpm i**。
* 已从 [@BotFather](https://t.me/BotFather) 创建 Telegram Bot 并取得 Token。
* Docker 可用于启动仓库提供的 Postgres 与 pgvector 服务。
* 可用的聊天模型和嵌入模型服务。

::: warning 凭据安全
Telegram Bot Token、数据库连接和模型 API Key 只应保存在本地 **.env.local** 文件中。不要提交、截图或发送这些配置。
:::

## 配置

~~~bash
cp services/telegram-bot/.env services/telegram-bot/.env.local
~~~

编辑 **services/telegram-bot/.env.local**，填写 **TELEGRAM_BOT_TOKEN**、数据库连接、聊天模型与嵌入模型配置。

## 初始化数据库

~~~bash
cd services/telegram-bot
docker compose up -d
cd ../..
pnpm -F @proj-airi/telegram-bot db:push
~~~

## 启动

~~~bash
pnpm -F @proj-airi/telegram-bot start
~~~

## 注意事项

数据库、Telegram Token 和模型凭据都属于敏感信息。不要提交 **.env.local**；首次部署前也应确认数据库备份和访问控制。
