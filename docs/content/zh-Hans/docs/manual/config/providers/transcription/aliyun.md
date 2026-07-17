---
title: 阿里云 NLS
description: 在 AIRI 中配置阿里云智能语音交互服务（ASR）
---

阿里云 NLS 为 AIRI 提供实时语音转文字（ASR）能力。完成配置后，在“听觉”中选择阿里云 NLS 并测试麦克风输入。

::: info 为什么选择阿里云 NLS？
如果你已使用阿里云账户，并需要实时语音识别能力，可以选择阿里云 NLS。
:::

## 第一步：准备凭据

1. 在[阿里云智能语音交互控制台](https://nls-portal.console.aliyun.com/overview)开通服务并创建项目，复制该项目的 **AppKey**。
2. 在 **AccessKey 管理** 中创建具备所需权限的 RAM 用户 AccessKey。
3. 复制 **AccessKey ID** 和 **AccessKey Secret**；Secret 通常只会完整显示一次。

::: warning AccessKey 安全
不要将 AccessKey ID、AccessKey Secret 或 AppKey 提交到仓库、放入截图，或发送给他人。请遵循最小权限原则；凭据泄露后，立即在阿里云控制台禁用并创建新凭据。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 语音识别 → 阿里云 NLS**。
2. 填写 **AccessKey ID**、**AccessKey Secret** 和 **AppKey**。
3. 选择距离你最近的区域，例如华东 `cn-shanghai`、华北 `cn-beijing` 或华南 `cn-shenzhen`。

### 3. 配置校验

1. 确认页面提示基础凭据验证通过。
2. 在“听觉”中选择阿里云 NLS 和音频输入设备。
3. 点击“开始监听”，然后对着麦克风说话或播放一段音频。
4. 在转写区域确认文字能实时输出；识别结果不准确时，可调整灵敏度后再次测试。

## 排查

凭据验证失败时，请确认三项凭据来自同一阿里云账户与项目，并检查 RAM 用户权限。没有文字结果时，请确认系统已授予 AIRI 麦克风权限。
