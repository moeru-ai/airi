---
title: X / Twitter
description: 使用 X Developer Platform 凭据启用 AIRI 的 X / Twitter 集成
---

X / Twitter 集成使用 X Developer Platform 应用的四项凭据，让 AIRI 的服务通道能够请求 X / Twitter 功能。凭据由你自己的 X 开发者账号签发；是否具备读取、发布或其他能力取决于该应用已获授的权限和 X 的套餐限制。

## 前提条件

* 一个可使用 [X Developer Portal](https://developer.x.com/en/portal/dashboard) 的 X 开发者账号。
* 一个已创建的 X 应用，并已生成 API Key、API Secret、Access Token 和 Access Token Secret。
* 应用拥有你要使用的 API 权限。

::: warning 凭据安全
API Key、API Secret、Access Token 与 Access Token Secret 等同于应用的访问凭据。只在 AIRI 的本机设置中填写它们；不要提交到仓库、放进截图、贴到 Issue 或发送给他人。怀疑泄露时，请立即在 X Developer Portal 中重新生成对应凭据。
:::

## 在 AIRI 中配置

1. 打开 **设置 → 机体模块 → X / Twitter**。
2. 启用 X / Twitter 集成。
3. 分别填写 API Key、API Secret、Access Token 与 Access Token Secret。
4. 点击 **保存**。四项字段均非空时，页面会显示“已配置”。

“已配置”表示 AIRI 已保存凭据，并不保证所有请求都能成功；X 会根据应用权限、账号状态、访问套餐和速率限制决定实际结果。

## 排查

* 重新复制四项凭据，确认没有多余空格或把 Key 与 Secret 填反。
* 在 X Developer Portal 检查应用的权限是否覆盖当前操作。
* 检查应用、项目和开发者账号是否处于可用状态，以及当前套餐是否允许该 API 请求。
* 请求被拒绝或被限速时，查看 X 返回的错误信息并等待其限制窗口结束；不要通过重复请求绕过限速。
