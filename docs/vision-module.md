# 视觉模块实现文档

本文档描述了 AIRI 项目中视觉模块的完整实现，包括设置页面的测试平台和对话集成的图片功能。

## 架构概述

视觉模块分为两个主要部分：

1. **设置页面测试平台** (`/settings/modules/vision`) - 用于测试和配置视觉服务
2. **对话集成功能** - 在聊天界面中添加图片分析和上传功能

## 功能特性

### 1. 设置页面测试平台

- **提供商配置**: 选择和配置视觉AI提供商
- **摄像头捕获**: 启用摄像头进行实时图像捕获
- **屏幕捕获**: 支持屏幕内容捕获和分析
- **图片上传**: 上传本地图片进行测试
- **自动分析**: 捕获后自动进行视觉分析
- **测试提示**: 自定义分析提示词

### 2. 对话集成功能

- **图片上传**: 在聊天界面中直接上传图片
- **图片预览**: 缩略图和详细预览模式
- **拖拽支持**: 支持拖拽图片到输入区域
- **状态管理**: 分析进度和结果显示
- **错误处理**: 分析失败的错误提示和重试

## 技术实现

### 文件结构

```
packages/stage-ui/src/
├── stores/modules/vision.ts                    # 视觉模块状态管理
├── composables/
│   ├── use-vision.ts                          # 视觉功能 composable
│   └── use-chat-vision.ts                     # 对话视觉功能 composable
└── components/chat/
    ├── ImageUpload.vue                        # 图片上传组件
    ├── ImagePreview.vue                       # 图片预览组件
    └── index.ts                              # 导出文件

packages/stage-pages/src/pages/settings/modules/vision.vue
├── 视觉设置页面和测试平台
```

### 核心组件

#### 1. VisionStore (`stores/modules/vision.ts`)

负责视觉模块的状态管理：

```typescript
interface VisionStore {
  // 配置状态
  activeVisionProvider: string
  activeVisionModel: string
  enableCameraCapture: boolean
  enableScreenCapture: boolean
  autoAnalyzeOnCapture: boolean

  // 功能方法
  analyzeImage: (imageData, prompt?, options?) => any
  analyzeImageDirect: (imageData, prompt?, options?) => any
  loadModelsForProvider: (providerId) => any
}
```

#### 2. ImageUpload 组件

图片上传入口组件：

- **桌面端**: 输入框右下角的图片图标
- **移动端**: 输入框右侧的拖拽上传区域
- **权限检查**: 自动检查视觉提供商配置状态
- **拖拽支持**: 支持拖拽图片文件

#### 3. ImagePreview 组件

图片预览和管理组件：

- **紧凑模式**: 横向缩略图列表
- **完整模式**: 详细预览+分析结果
- **状态指示**: 分析进度、成功、失败状态
- **操作功能**: 删除图片、重试分析

#### 4. useChatVision Hook

对话视觉功能的业务逻辑：

```typescript
interface ChatVision {
  // 图片管理
  addImage: (dataUrl, file) => Promise<ChatImage>
  removeImage: (imageId) => Promise<void>
  clearAllImages: () => void

  // 消息创建
  createMessageWithImages: (content, role) => ChatMessageWithImages
  formatMessageForAI: (message) => string

  // 分析功能
  prepareImagesForChat: (options?) => Promise<void>
  analyzeImageIfAvailable: (imageId, options?) => Promise<void>
}
```

## 使用方法

### 1. 配置视觉提供商

1. 进入 设置 → 机体模块 → 视觉
2. 配置视觉AI提供商和模型
3. 启用摄像头和/或屏幕捕获功能

### 2. 在对话中使用图片

**方法一：点击上传**
- 点击输入框右下角的图片图标
- 选择图片文件
- 发送消息

**方法二：拖拽上传**
- 直接拖拽图片到输入区域
- 松开鼠标完成上传

**方法三：粘贴上传**
- 复制图片后粘贴到输入框（如果支持）

## 状态管理

### 图片状态流程

```
上传成功 → 等待分析 → 分析中 → 分析完成/失败
               ↓           ↓          ↓
           可发送消息   显示进度   显示结果/错误
```

### 错误处理

- **权限错误**: 显示"视觉提供商未配置"提示
- **分析失败**: 显示错误信息和重试按钮
- **网络错误**: 自动重试机制

## 响应式设计

### 桌面端布局
- 图片图标：输入框右下角
- 预览模式：详细预览面板
- 拖拽区域：整个输入框区域

### 移动端布局
- 图片图标：输入框右侧固定位置
- 预览模式：紧凑缩略图列表
- 拖拽区域：输入框右侧边条

## 性能优化

1. **图片压缩**: 自动压缩大尺寸图片
2. **懒加载**: 预览图片延迟加载
3. **缓存机制**: 分析结果本地缓存
4. **内存管理**: 及时清理未使用的图片数据

## 安全考虑

1. **文件类型检查**: 只允许图片格式
2. **文件大小限制**: 防止上传过大的文件
3. **隐私保护**: 图片数据本地处理，不上传到未授权的服务

## 扩展功能

未来可以添加的功能：

1. **批量上传**: 支持一次上传多张图片
2. **OCR识别**: 文字识别功能集成
3. **实时标注**: 图片内容标注功能
4. **云存储**: 图片云端同步
5. **格式转换**: 图片格式转换功能

## 依赖关系

- `@xsai/generate-vision`: AI视觉分析
- `@vueuse/core`: Vue 工具函数
- `@proj-airi/ui`: UI 组件库
- `pinia`: 状态管理

## 故障排除

### 常见问题

1. **图片无法上传**: 检查视觉提供商是否配置
2. **分析失败**: 确认网络连接和API密钥
3. **界面问题**: 确认组件版本兼容性

### 调试信息

开发模式下会在控制台输出详细的调试信息：
- 图片上传状态
- 分析请求和响应
- 错误详情和堆栈信息

## 注意事项

1. **浏览器兼容性**: 需要支持现代浏览器API
2. **权限管理**: 需要相机/屏幕捕获权限
3. **API限制**: 注意服务商的调用频率限制
4. **隐私保护**: 避免上传敏感图片信息
