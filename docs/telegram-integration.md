# Telegram 集成配置

本文档描述了如何在 AIRI 项目中配置 Telegram 集成。

## 概述

AIRI 支持通过 Telegram 进行消息和贴纸互动。Telegram 集成已经在项目中实现，但没有在设置界面中暴露。现在已经将 Telegram 和 Discord 合并到同一个"消息"配置界面中。

## 新增功能

### 1. 统一的消息配置界面

- **位置**: `/settings/modules/messaging`
- **功能**: 在一个界面中同时配置 Discord 和 Telegram
- **界面**: 分区显示，每个平台有独立的配置选项

### 2. Telegram 配置选项

- **启用开关**: 启用或禁用 Telegram 集成
- **Bot Token**: 从 @BotFather 获取的 Telegram bot 令牌
- **配置状态**: 显示是否正确配置

### 3. 国际化支持

- 支持英文和中文界面
- 配置项说明和帮助文本均已本地化

## 技术实现

### 新增文件

1. **Store**: `packages/stage-ui/src/stores/modules/telegram.ts`
   - 管理 Telegram 配置状态
   - 与 Discord store 使用相同的接口模式

2. **组件**:
   - `packages/stage-ui/src/components/modules/MessagingTelegram.vue` - 单独的 Telegram 组件
   - `packages/stage-ui/src/components/modules/Messaging.vue` - 统一的消息配置组件

3. **页面**: `packages/stage-pages/src/pages/settings/modules/messaging.vue`
   - 新的设置页面路由

4. **i18n**:
   - 英文: `packages/i18n/src/locales/en/settings.yaml`
   - 中文: `packages/i18n/src/locales/zh-Hans/settings.yaml`

### 修改的文件

1. **路由配置**:
   - `apps/stage-web/src/layouts/settings.vue`
   - `apps/stage-tamagotchi/src/renderer/layouts/settings.vue`

2. **模块列表**:
   - `packages/stage-ui/src/composables/use-modules-list.ts`
   - 将原来的 Discord 单独配置改为统一的消息配置

3. **导出文件**:
   - `packages/stage-ui/src/stores/modules/index.ts`
   - `packages/stage-ui/src/components/modules/index.ts`

## 使用方法

### 1. 创建 Telegram Bot

1. 在 Telegram 中联系 @BotFather
2. 使用 `/newbot` 命令创建新的 bot
3. 获取 bot token

### 2. 在 AIRI 中配置

1. 进入设置 → 模块 → 消息
2. 找到 Telegram 部分
3. 启用 Telegram 集成
4. 输入 Bot Token
5. 点击保存

### 3. 环境变量

Telegram bot 服务需要设置环境变量 `TELEGRAM_BOT_TOKEN`，这个会通过配置界面自动同步到后端。

## 服务架构

Telegram bot 作为独立服务运行在 `services/telegram-bot/` 目录中，支持：

- 消息接收和处理
- 贴纸识别和存储
- 照片处理
- 群组聊天支持
- AI 驱动的智能回复

## 配置验证

设置页面会显示配置状态：
- 红色警告：未正确配置
- 绿色提示：配置成功

## 路由变更

原有的 `/settings/modules/messaging-discord` 路由变更为 `/settings/modules/messaging`，同时支持两个平台的配置。

## 向后兼容性

为了保持向后兼容性，原有的 Discord 组件和配置仍然保留，只是通过统一界面进行管理。
