# Twitter Service Architecture Documentation

## 1. Project Overview

Twitter Service is a web automation service based on BrowserBase, providing structured access and interaction capabilities with Twitter data. It employs a layered architecture design that supports multiple adapters for integration with different applications.

## 2. Design Goals

- **Reliability**: Stable handling of Twitter page changes and limitations
- **Scalability**: Easy to add new features and support different integration methods
- **Performance Optimization**: Intelligent management of request frequency and browser sessions
- **Data Structuring**: Provides standardized, typed data models

## 3. Architecture Overview

```
┌─────────────────────────────────────────────┐
│               Application/Consumer Layer    │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │            │         │             │    │
│   │  Airi Core │         │ Other LLM   │    │
│   │            │         │ Applications │    │
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

## 4. Technology Stack and Dependencies

- **Core Library**: TypeScript, Node.js
- **Browser Automation**: BrowserBase API
- **HTML Parsing**: unified, rehype-parse, unist-util-visit
- **API Server**: H3.js, listhen
- **Adapters**: Airi Server SDK, MCP SDK
- **Logging System**: @guiiai/logg
- **Utility Library**: zod (type validation)

## 5. Key Components

### 5.1 Adapter Layer

#### 5.1.1 Airi Adapter

Provides integration with the Airi LLM platform, handling event-driven communication.

#### 5.1.2 MCP Adapter

Implements the Model Context Protocol interface, providing communication based on HTTP. Currently using the official MCP SDK implementation, providing high-performance HTTP server and SSE communication through H3.js.

#### 5.1.3 Development Server

Using listhen for optimized development experience, including automatic browser opening, real-time logging, and debugging tools.

### 5.2 Core Service Layer

#### 5.2.1 Authentication Service (Auth Service)

Handles Twitter login and session maintenance.

#### 5.2.2 Timeline Service (Timeline Service)

Gets and processes Twitter timeline content.

#### 5.2.3 Other Services

Includes search service, interaction service, user profile service, etc. (not implemented in MVP)

### 5.3 Parsers and Tools

#### 5.3.1 Tweet Parser

Extracts structured data from HTML.

#### 5.3.2 Rate Limiter

Controls request frequency to avoid triggering Twitter limits.

## 6. Data Flow

1. **Request Flow**: Application Layer → Adapter → Core Service → Browser Adapter Layer → BrowserBase API → Twitter
2. **Response Flow**: Twitter → BrowserBase API → Browser Adapter Layer → Core Service → Data Parsing → Adapter → Application Layer

## 7. Configuration System

Configuration is divided into several main parts:

```typescript
interface Config {
  // BrowserBase configuration
  browserbase: {
    apiKey: string
    endpoint?: string
  }

  // Browser configuration
  browser: BrowserConfig

  // Twitter configuration
  twitter: {
    credentials?: TwitterCredentials
    defaultOptions?: {
      timeline?: TimelineOptions
      search?: SearchOptions
    }
  }

  // Adapter configuration
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

  // System configuration
  system: {
    logLevel: string
    concurrency: number
  }
}
```

## 8. Development and Testing

### 8.1 Development Environment Setup

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env to add BrowserBase API key and Twitter credentials

# Development mode startup
npm run dev        # Standard mode
npm run dev:mcp    # MCP development server mode
```

### 8.2 Testing Strategy

- **Unit Tests**: Test parsers, utility classes, and business logic
- **Integration Tests**: Test service and adapter interaction
- **End-to-End Tests**: Simulate complete usage scenarios

## 9. Integration Example

### 9.1 Integrating from Other Node.js Applications

```typescript
import { BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function main() {
  // Initialize browser
  const browser = new BrowserBaseMCPAdapter('your-api-key')
  await browser.initialize({ headless: true })

  // Create Twitter service
  const twitter = new TwitterService(browser)

  // Login
  await twitter.login({
    username: 'your-username',
    password: 'your-password'
  })

  // Get timeline
  const tweets = await twitter.getTimeline({ count: 10 })
  console.log(tweets)

  // Release resources
  await browser.close()
}
```

### 9.2 Integrating as Airi Module

```typescript
import { AiriAdapter, BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function startAiriModule() {
  const browser = new BrowserBaseMCPAdapter(process.env.BROWSERBASE_API_KEY)
  await browser.initialize({ headless: true })

  const twitter = new TwitterService(browser)

  // Create Airi adapter
  const airiAdapter = new AiriAdapter(twitter, {
    url: process.env.AIRI_URL,
    token: process.env.AIRI_TOKEN,
    credentials: {
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD
    }
  })

  // Start adapter
  await airiAdapter.start()

  console.log('Twitter service running as Airi module')
}
```

### 9.3 Using MCP for Integration

```typescript
// Use MCP SDK to interact with Twitter service
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

async function connectToTwitterService() {
  // Create SSE transport
  const transport = new SSEClientTransport('http://localhost:8080/sse', 'http://localhost:8080/messages')

  // Create client
  const client = new McpClient()
  await client.connect(transport)

  // Get timeline
  const timeline = await client.get('twitter://timeline/10')
  console.log('Timeline:', timeline.contents)

  // Use tool to send tweet
  const result = await client.useTool('post-tweet', { content: 'Hello from MCP!' })
  console.log('Result:', result.content)

  return client
}
```

## 10. Extension Guide

### 10.1 Adding New Features

For example, adding "Get Tweets from a Specific User" functionality:

1. Extend the interface in `src/types/twitter.ts`
2. Implement the method in `src/core/twitter-service.ts`
3. Add corresponding handling logic in the adapter
4. If it's an MCP adapter, add appropriate resources or tools in `configureServer()`

### 10.2 Supporting New Adapters

1. Create a new adapter class
2. Implement communication logic with the target system
3. Add configuration support in the entry file

## 11. Maintenance Recommendations

- **Automated Testing**: Write unit tests and integration tests
- **Monitoring & Alerts**: Monitor service status and Twitter access limitations
- **Selector Updates**: Regularly validate and update selector configurations
- **Session Management**: Optimize session management to improve stability

## 12. Project Roadmap

- MVP Stage: Implement core functionality (authentication, browsing timeline)
- Stage Two: Enhance interaction features (likes, comments, retweets)
- Stage Three: Advanced features (search, advanced filtering, data analysis)
- Stage Four: Performance optimization and stability improvements
