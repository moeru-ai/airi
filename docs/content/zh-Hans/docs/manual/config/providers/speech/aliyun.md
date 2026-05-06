---
title: 阿里云 NLS
description: 配置阿里云智能语音交互服务（ASR）
---

# 阿里云 NLS (智能语音)

阿里云 NLS 模块负责 AIRI 的“听觉”，即实时语音转文字（ASR）。

## 第一步：获取阿里云凭据 (核心步骤)

### 1. 开通服务
访问 [阿里云智能语音交互官网](https://ai.aliyun.com/nls)，点击“立即开通”。（放心，有免费试用额度）。

### 2. 获取 AppKey (项目的“身份证”)
1. 进入 [智能语音控制台](https://nls-portal.console.aliyun.com/overview)。
2. 点击“全部项目” -> “创建项目”。
3. 创建完成后，你会看到一串类似 `zFDQx28ZwS...` 的字符串，这就是 **AppKey**。

### 3. 获取 AccessKey (你的“账号密码”)
这是最容易找错的地方：
1. 鼠标悬停在页面右上角的头像，点击 **AccessKey 管理**。
2. 建议点击“使用 RAM 用户  AccessKey”（更安全）。
3. 创建一个用户，并确保勾选了 **“OpenAPI 调用访问”**。
4. **最重要**：在“权限管理”里搜索并添加 `AliyunASRFullAccess` 权限。
5. 保存好生成的 `AccessKey ID` 和 `AccessKey Secret`。

    ::: warning 安全提醒

    **Access Key Secret** 等同于你的账号密码。请勿在截图或直播中展示此页面，以防额度被他人盗刷。同时，Access Key Secret 仅显示一次，关闭当前页面后就无法再显示，所以请务必尽快填入 Airi。
    :::

## 第二步：输入 API 信息

请在 AIRI 的 **Settings -> Aliyun NLS** 页面中按以下说明填写：

### 1. 基础凭据 (Basic)
* **Access Key ID**: 阿里云账户的身份识别码（通常以 `LTAI` 开头）。
* **Access Key Secret**: 你的账户安全密钥。
* **App Key**: 在阿里云“智能语音交互”控制台中创建的项目 AppKey。
* **Region**: 根据你目前所在地理位置选择服务器区域以获得最低延迟：
    - 华东地区请选择 `cn-shanghai`;
    - 华北地区请选择 `cn-beijing`;
    - 华南地区请选择 `cn-shenzhen`。

### 2. 校验与测试
当底部出现绿色的 **"Configuration validation success"** 时，说明配置已生效。

#### 实时测试 (Realtime Transcription)
你可以直接在右侧面板进行测试：
1.  点击 **Start Realtime Transcription**。
2.  对着麦克风说话。
3.  在 **Transcripts** 区域观察文字是否能实时、准确地流式输出。

---
