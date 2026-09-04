---
title: Minecraft 智能体
description: 在受信任的 Minecraft 服务器上运行 AIRI 的本地游戏智能体
---

Minecraft 集成会通过 Mineflayer 连接 AIRI 与 Minecraft 服务器，让智能体接收上下文、执行游戏内动作并回传状态。它面向本地开发和维护；当前实现正计划迁移到 Fabric 运行时，不建议围绕它开发新的长期功能。

::: warning 温馨提示
目前 Minecraft 智能体仅支持从源码安装使用，参考[这里](https://airi.moeru.ai/docs/zh-Hans/docs/contributing/)建立本地开发环境以体验。
:::

## 前提条件

* 已在仓库根目录安装依赖。

~~~bash
pnpm i
~~~

* 可访问的本地或受信任 Minecraft 服务器；连接地址与端口由配置文件提供。
* 可用的 AIRI 与模型服务配置。
* 可用的 openai 兼容 API。

::: warning 凭据安全
API Key、服务地址和 Minecraft 服务器凭据只应保存在本地 **.env.local** 文件中。不要提交、截图或发送这些配置。
这里配置的 API Key 与 AIRI 本体不相同且不互通，建议为 Minecraft 服务配置独立的Key。
:::

## 配置

~~~bash
cp integrations/minecraft/.env integrations/minecraft/.env.local
~~~

编辑 **integrations/minecraft/.env.local**，填写 Minecraft 服务器、AIRI 与模型服务所需的配置。

在桌面版中，打开 **设置 → 连接**。显示并复制 **Auth Token**。然后添加以下 AIRI 通道配置：

~~~env
AIRI_WS_BASEURL=ws://localhost:6121/ws
AIRI_CLIENT_NAME=minecraft-bot
AIRI_WS_TOKEN=<Auth Token from Settings → Connection>
~~~

以下是必填的字段以及填写说明（以deeepseek为例）

| 字段 | 含义 | 填写建议 |
| --- | --- | --- |
| OPENAI_API_BASEURL | 服务商 API 的根地址 | 如 https://api.deepseek.com 注意不需要加chat/completions后缀 |
| OPENAI_API_KEY | 服务商签发的访问令牌 | 在两个引号间直接粘贴完整密钥 |
| OPENAI_MODEL | 默认模型 ID | 填写通用模型 ID ，如 deepseek-v4-flash |
| OPENAI_REASONING_MODEL | 思考模型 ID | 一般选择支持思考的、更强大的模型，如 deepseek-v4-pro |
| BOT_USERNAME | 机器人的游戏名称 | 尽量仅由数字、字母、下划线组成 |
| BOT_HOSTNAME | 服务器地址 | 填写服务器地址或者ip，若为本地服务器填localhost |
| BOT_PORT | 服务器端口 | 一般是25565，填写服务器实际对外暴露的端口号 |
| BOT_VERSION | 服务器版本 | 填写Minecraft版本号，如1.21.1 |

默认离线登录，如需正版登录参考 **integrations/minecraft/.env** 中说明。

## 启动

~~~bash
pnpm -F @proj-airi/minecraft-bot dev
~~~

启动后，智能体会连接 AIRI 和 Minecraft 服务器。开发环境可查看终端日志确认连接和动作状态。
在游戏中发送文字即可与 AIRI 交互

## 安全与限制

不要将该智能体连接到不受信任的公共服务器。它会驱动本地 Minecraft 会话和网络连接；即使动作计划在隔离环境中执行，恶意服务器仍可能造成非预期行为。
