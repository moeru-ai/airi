# Twitter 服务架构文档

## 1. 项目概述

Twitter 服务是一个基于 BrowserBase 的 Web 自动化服务，提供结构化的 Twitter 数据访问和交互能力。它采用分层架构设计，支持多种适配器以便与不同的应用集成。

## 2. 设计目标

- **可靠性**：稳定处理 Twitter 页面的变化和限制
- **可扩展性**：易于添加新功能和支持不同接入方式
- **性能优化**：智能管理请求频率和浏览器会话
- **数据结构化**：提供规范、类型化的数据模型

## 3. 架构总览

```
┌─────────────────────────────────────────────┐
│               应用层/消费者层                │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │            │         │             │    │
│   │  Airi Core │         │ 其他 LLM 应用 │    │
│   │            │         │             │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                   适配器层                   │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │Airi Adapter│         │ MCP Adapter │    │
│   │(@server-sdk)│        │ (HTTP/JSON) │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                 核心服务层                   │
│                                             │
│   ┌──────────────────────────────────┐      │
│   │          Twitter Services         │      │
│   │                                   │      │
│   │  ┌────────┐       ┌────────────┐  │      │
│   │  │ Auth   │       │ Timeline   │  │      │
│   │  │ Service│       │ Service    │  │      │
│   │  └────────┘       └────────────┘  │      │
│   │                                   │      │
│   └──────────────────┬────────────────┘      │
└──────────────────────┼────────────────────────┘
                      │
          ┌───────────▼────────────┐
          │     浏览器适配层       │
          │   (BrowserAdapter)     │
          └───────────┬────────────┘
                      │
          ┌───────────▼────────────┐
          │     BrowserBase API    │
          └──────────────────────────┘
```

## 4. 技术栈与依赖

- **核心库**: TypeScript, Node.js
- **浏览器自动化**: BrowserBase API
- **HTML解析**: unified, rehype-parse, unist-util-visit
- **API服务器**: H3.js, listhen
- **适配器**: Airi Server SDK, MCP SDK
- **日志系统**: @guiiai/logg
- **工具库**: zod（类型验证）

## 5. 关键组件

### 5.1 适配器层

#### 5.1.1 Airi 适配器

提供与 Airi LLM 平台的集成，处理事件驱动的通信。

#### 5.1.2 MCP 适配器

实现 Model Context Protocol 接口，提供基于 HTTP 的通信。现使用官方 MCP SDK 实现，通过 H3.js 提供高性能 HTTP 服务器和 SSE 通信。

#### 5.1.3 开发服务器

使用 listhen 提供优化的开发体验，包括自动打开浏览器、实时日志和调试工具。

### 5.2 核心服务层

#### 5.2.1 认证服务 (Auth Service)

处理 Twitter 登录和会话维护。

#### 5.2.2 时间线服务 (Timeline Service)

获取和处理 Twitter 时间线内容。

#### 5.2.3 其他服务

包括搜索服务、互动服务、用户资料服务等（部分未在 MVP 中实现）。

### 5.3 解析器和工具

#### 5.3.1 Tweet 解析器

从 HTML 中提取推文结构化数据。

#### 5.3.2 频率限制器

控制请求频率，避免触发 Twitter 的限制。

## 6. 数据流

1. **请求流**：应用层 → 适配器 → 核心服务 → 浏览器适配层 → BrowserBase API → Twitter
2. **响应流**：Twitter → BrowserBase API → 浏览器适配层 → 核心服务 → 数据解析 → 适配器 → 应用层

## 7. 配置系统

配置分为以下几个主要部分：

```typescript
interface Config {
  // BrowserBase 配置
  browserbase: {
    apiKey: string
    endpoint?: string
  }

  // 浏览器配置
  browser: BrowserConfig

  // Twitter 配置
  twitter: {
    credentials?: TwitterCredentials
    defaultOptions?: {
      timeline?: TimelineOptions
      search?: SearchOptions
    }
  }

  // 适配器配置
  adapters: {
    airi?: {
      url?: string
      token?: string
      enabled: boolean
    }
    mcp?: {
      port?: number
      enabled: boolean
    }
  }

  // 系统配置
  system: {
    logLevel: string
    concurrency: number
  }
}
```

## 8. 开发与测试

### 8.1 开发环境设置

```bash
# 安装依赖
npm install

# 设置环境变量
cp .env.example .env
# 编辑 .env 添加 BrowserBase API 密钥和 Twitter 凭据

# 开发模式启动
npm run dev        # 标准模式
npm run dev:mcp    # MCP 开发服务器模式
```

### 8.2 测试策略

- **单元测试**：测试解析器、工具类和业务逻辑
- **集成测试**：测试服务和适配器的交互
- **端到端测试**：模拟完整的使用场景

## 9. 集成示例

### 9.1 从其他 Node.js 应用集成

```typescript
import { BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function main() {
  // 初始化浏览器
  const browser = new BrowserBaseMCPAdapter('your-api-key')
  await browser.initialize({ headless: true })

  // 创建 Twitter 服务
  const twitter = new TwitterService(browser)

  // 登录
  await twitter.login({
    username: 'your-username',
    password: 'your-password'
  })

  // 获取时间线
  const tweets = await twitter.getTimeline({ count: 10 })
  console.log(tweets)

  // 释放资源
  await browser.close()
}
```

### 9.2 作为 Airi 模块集成

```typescript
import { AiriAdapter, BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function startAiriModule() {
  const browser = new BrowserBaseMCPAdapter(process.env.BROWSERBASE_API_KEY)
  await browser.initialize({ headless: true })

  const twitter = new TwitterService(browser)

  // 创建 Airi 适配器
  const airiAdapter = new AiriAdapter(twitter, {
    url: process.env.AIRI_URL,
    token: process.env.AIRI_TOKEN,
    credentials: {
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD
    }
  })

  // 启动适配器
  await airiAdapter.start()

  console.log('Twitter service running as Airi module')
}
```

### 9.3 使用 MCP 进行集成

```typescript
// 使用 MCP SDK 与 Twitter 服务交互
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

async function connectToTwitterService() {
  // 创建 SSE 传输
  const transport = new SSEClientTransport('http://localhost:8080/sse', 'http://localhost:8080/messages')

  // 创建客户端
  const client = new McpClient()
  await client.connect(transport)

  // 获取时间线
  const timeline = await client.get('twitter://timeline/10')
  console.log('Timeline:', timeline.contents)

  // 使用工具发送推文
  const result = await client.useTool('post-tweet', { content: 'Hello from MCP!' })
  console.log('Result:', result.content)

  return client
}
```

## 10. 扩展指南

### 10.1 添加新功能

例如添加"获取特定用户发布的推文"功能：

1. 在 `src/types/twitter.ts` 中扩展接口
2. 在 `src/core/twitter-service.ts` 中实现方法
3. 在适配器中添加对应的处理逻辑
4. 如果是 MCP 适配器，在 `configureServer()` 中添加相应的资源或工具

### 10.2 支持新的适配器

1. 创建新的适配器类
2. 实现与目标系统的通信逻辑
3. 在入口文件中添加配置支持

## 11. 维护建议

- **自动化测试**：编写单元测试和集成测试
- **监控与告警**：监控服务状态和 Twitter 的访问限制
- **选择器更新**：定期验证和更新选择器配置
- **会话管理**：优化会话管理以提高稳定性

## 12. 项目路线图

- MVP 阶段：实现核心功能（认证、浏览时间线）
- 阶段二：完善互动功能（点赞、评论、转发）
- 阶段三：高级功能（搜索、高级过滤、数据分析）
- 阶段四：性能优化和稳定性提升
