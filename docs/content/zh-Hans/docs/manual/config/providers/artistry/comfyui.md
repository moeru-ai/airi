---
title: ComfyUI（艺术创作）
description: 在 AIRI 中连接本地 ComfyUI 工作流
---

ComfyUI 让 AIRI 使用你本机或可信局域网中的图像生成工作流。完成配置后，可在 **设置 → 艺术** 选择 ComfyUI，并让 AIRI 使用已保存的工作流生成图片。

::: info 为什么选择 ComfyUI？
如果你希望使用自己安装的模型、节点和工作流，并把图像生成留在本地环境中，ComfyUI 是 AIRI 的本地艺术服务商。
:::

## 第一步：准备 ComfyUI 服务与工作流

1. 启动 ComfyUI。AIRI 默认连接 `http://localhost:8188`。
2. 在 ComfyUI 中准备能够直接执行的图像工作流，并从 ComfyUI 导出其 API 工作流 JSON。
3. 若 AIRI 与 ComfyUI 不在同一台设备，确认该地址可从 AIRI 所在设备访问。

::: warning 本地服务与工作流安全
不要把 ComfyUI 的服务端口暴露给不受信任的公共网络。导入工作流前检查其中的节点、模型路径和参数，不要导入来源不明的工作流 JSON。
:::

## 第二步：在 AIRI 中配置

1. 打开 **设置 → 服务商 → 艺术 → ComfyUI**。
2. 填写 ComfyUI Server URL；本机默认使用 `http://localhost:8188`。
3. 点击 **测试连接**，确认 AIRI 能读取 ComfyUI 服务状态。
4. 在“工作流”区域上传 API 工作流 JSON，填写名称，并选择要让 AIRI 暴露的输入字段。
5. 保存工作流，并将它设为活动工作流。

### 3. 配置校验

1. 打开 **设置 → 艺术**，选择 **ComfyUI**。
2. 选择刚保存的工作流，使用一条不含敏感信息的提示词发起生成。
3. ComfyUI 完成任务并返回图片，即表示连接、工作流和可暴露字段配置成功。

## 排查

测试连接失败时，检查 ComfyUI 是否运行、Server URL、端口和网络访问。浏览器报跨域错误时，按 ComfyUI 设置页显示的 CORS 启动参数重新启动服务。工作流无法执行时，确认导入的是 API 格式 JSON，所用节点和模型已在 ComfyUI 中安装。
