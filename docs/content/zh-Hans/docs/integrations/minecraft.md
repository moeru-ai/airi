---
title: Minecraft 智能体
description: 在受信任的 Minecraft 服务器上运行 AIRI 的本地游戏智能体
---

Minecraft 集成会通过 Mineflayer 连接 AIRI 与 Minecraft 服务器，让智能体接收上下文、执行游戏内动作并回传状态。它面向本地开发和维护；当前实现正计划迁移到 Fabric 运行时，不建议围绕它开发新的长期功能。

## 前提条件

* 已在仓库根目录安装依赖：**pnpm i**。
* 可访问的本地或受信任 Minecraft 服务器；连接地址与端口由环境配置提供。
* 可用的 AIRI 与模型服务配置。

::: warning 凭据安全
API Key、服务地址和 Minecraft 服务器凭据只应保存在本地 **.env.local** 文件中。不要提交、截图或发送这些配置。
:::

## 配置

~~~bash
cp services/minecraft/.env services/minecraft/.env.local
~~~

编辑 **services/minecraft/.env.local**，填写 Minecraft 服务器、AIRI 与模型服务所需的配置。

## 启动

~~~bash
pnpm -F @proj-airi/minecraft-bot dev
~~~

启动后，智能体会连接 AIRI 和 Minecraft 服务器。开发环境可查看终端日志确认连接和动作状态。

## 安全与限制

不要将该智能体连接到不受信任的公共服务器。它会驱动本地 Minecraft 会话和网络连接；即使动作计划在隔离环境中执行，恶意服务器仍可能造成非预期行为。
