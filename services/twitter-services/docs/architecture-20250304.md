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
│   │  AIRI Core │         │ Other LLM   │    │
│   │            │         │ Applications│    │
│   │            │         │             │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                  Adapter Layer              │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │AIRI Adapter│         │ MCP Adapter │    │
│   │(@server-sdk)│        │ (HTTP/JSON) │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                 Core Services Layer         │
│                                             │
│   ┌──────────────────────────────────┐      │
│   │          Twitter Services        │      │
│   │                                  │      │
│   │  ┌────────┐       ┌────────────┐ │      │
│   │  │ Auth   │       │ Timeline   │ │      │
│   │  │ Service│       │ Service    │ │      │
│   │  └────────┘       └────────────┘ │      │
│   │                                  │      │
│   └──────────────────┬───────────────┘      │
└──────────────────────┼──────────────────────┘
                      │
          ┌───────────▼────────────┐
          │ Browser Adapter Layer  │
          │   (BrowserAdapter)     │
          └───────────┬────────────┘
                      │
          ┌───────────▼────────────┐
          │      Stagehand         │
          └───────────┬────────────┘
                      │
          ┌───────────▼────────────┐
          │     Playwright         │
          └────────────────────────┘
```

## 4. Technology Stack and Dependencies

- **Core Library**: TypeScript, Node.js
- **Browser Automation**: BrowserBase Stagehand, Playwright
- **HTML Parsing**: unified, rehype-parse, unist-util-visit
- **API Server**: H3.js, listhen
- **Adapters**: AIRI Server SDK, MCP SDK
- **Logging System**: @guiiai/logg
- **Configuration**: defu (deep merging configurations)
- **Utility Library**: zod (type validation)

## 5. Key Components

### 5.1 Adapter Layer

#### 5.1.1 AIRI Adapter

Provides integration with the AIRI LLM platform, handling event-driven communication.

#### 5.1.2 MCP Adapter

Implements the Model Context Protocol interface, providing communication based on HTTP. Currently using the official MCP SDK implementation, providing high-performance HTTP server and SSE communication through H3.js.

The MCP adapter exposes several tools and resources:

- **Timeline Resource**: Access tweets from the user's timeline
- **Tweet Details Resource**: Get detailed information about a specific tweet
- **User Profile Resource**: Retrieve user profile information

Additionally, it provides tools for interaction:

- **Login Tool**: Simplified authentication tool that provides clear feedback on session status. It attempts to load existing sessions, and clearly communicates whether a session was loaded successfully or if manual login is required. The tool no longer requires username/password parameters, as it relies on the enhanced session management system.
- **Post Tweet Tool**: Create and publish new tweets
- **Like Tweet Tool**: Like a tweet by its ID
- **Retweet Tool**: Retweet a tweet by its ID
- **Refresh Timeline Tool**: Refresh the timeline with the latest tweets, with options to control the count and whether to include replies and retweets.
- **Get My Profile Tool**: Get information about a user's profile. It can extract the username from the current URL or accept a specific username as a parameter.

The adapter uses internationalized messages (Chinese/English) to provide clear feedback to users about login status and session management.

#### 5.1.3 Development Server

Using listhen for optimized development experience, including automatic browser opening, real-time logging, and debugging tools.

### 5.2 Core Service Layer

#### 5.2.1 Authentication Service (Auth Service)

The Authentication Service has been significantly enhanced to improve reliability and error handling:

1. **Improved Session Detection**: Enhanced logic for detecting existing browser sessions
2. **Robust Error Handling**: Implemented granular error handling to distinguish between different authentication failure types
3. **Timeout Optimization**: Adjusted timeouts for various operations to enhance stability during network fluctuations
4. **Enhanced Cookie Management**: Improved cookie storage and loading mechanisms to reduce the need for manual login
5. **Session Validation**: Added comprehensive session validation to verify the integrity of saved sessions
6. **Simplified API**: Removed the need for explicit username/password in the login method, relying instead on session files and browser session detection

The service follows a multi-stage authentication approach:

1. **Session File Loading**: First attempts to load saved sessions from disk
2. **Existing Session Detection**: Checks if the browser already has a valid Twitter session
3. **Manual Login Process**: If necessary, guides through the Twitter login page

After successful authentication through any method, sessions are automatically persisted for future use. The system provides clear feedback to users about the current login state and automatically monitors and saves sessions when changes are detected.

#### 5.2.2 Timeline Service (Timeline Service)

Gets and processes Twitter timeline content.

#### 5.2.3 Other Services

Includes search service, interaction service, user profile service, etc. (not implemented in MVP)

### 5.3 Parsers and Tools

#### 5.3.1 Tweet Parser

Extracts structured data from HTML.

#### 5.3.2 Rate Limiter

Controls request frequency to avoid triggering Twitter limits.

#### 5.3.3 Session Manager

Manages authentication session data, providing methods to:

- Save session cookies to local files
- Load previous sessions during startup
- Delete invalid or expired sessions
- Validate session age and integrity

### 5.3.4 Browser Adapter Layer

The service has migrated from direct BrowserBase API usage to Stagehand, an AI-powered web browsing framework built on top of Playwright. Stagehand offers three core APIs that simplify browser automation:

- **act**: Execute actions on the page through natural language instructions
- **extract**: Retrieve structured data from the page using natural language queries
- **observe**: Analyze the page and suggest possible actions before execution

Stagehand processes the DOM in chunks to optimize LLM performance and provides fallback vision capabilities for complex page structures. This migration significantly improves code maintainability and automation reliability when interacting with Twitter's interface.

## 6. Data Flow

1. **Request Flow**: Application Layer → Adapter → Core Service → Browser Adapter Layer → BrowserBase API → Twitter
2. **Response Flow**: Twitter → BrowserBase API → Browser Adapter Layer → Core Service → Data Parsing → Adapter → Application Layer
3. **Authentication Flow**:
   - Load Session → Check Existing Session → Manual Login → Session Validation → Session Storage
   - Clear feedback is provided at each step of the authentication process

## 7. Configuration System

The configuration system has been optimized using the `defu` library for deep merging configurations, eliminating redundant initialization. The updated configuration structure includes Stagehand-specific settings:

```typescript
interface Config {
  // BrowserBase/Stagehand configuration
  browserbase: {
    apiKey: string
    projectId?: string
    endpoint?: string
    stagehand?: {
      modelName?: string // e.g., "gpt-4o" or "claude-3-5-sonnet-latest"
      modelClientOptions?: {
        apiKey: string // OpenAI or Anthropic API key
      }
    }
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

The system no longer relies on the `TWITTER_COOKIES` environment variable, as cookies are now managed through the session management system.

## 8. Development and Testing

### 8.1 Development Environment Setup

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env to add BrowserBase API key and Twitter credentials (optional)

# Development mode startup
npm run dev        # Standard mode
npm run dev:mcp    # MCP development server mode
```

### 8.2 Testing Strategy

- **Unit Tests**: Test parsers, utility classes, and business logic
- **Integration Tests**: Test service and adapter interaction
- **End-to-End Tests**: Simulate complete usage scenarios

## 9. Integration Example

### 9.1 Integration Example with Stagehand

```typescript
import { StagehandAdapter, TwitterService } from 'twitter-services'

async function main() {
  // Initialize Stagehand adapter
  const browser = new StagehandAdapter(process.env.BROWSERBASE_API_KEY, process.env.BROWSERBASE_PROJECT_ID)
  await browser.initialize({
    headless: true,
    stagehand: {
      modelName: 'gpt-4o', // Or 'claude-3-5-sonnet-latest' for Anthropic
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY // Or process.env.ANTHROPIC_API_KEY
      }
    }
  })

  // Create Twitter service
  const twitter = new TwitterService(browser)

  // Authenticate - will try multi-stage approach
  const loggedIn = await twitter.login()

  if (loggedIn) {
    console.log('Login successful')

    // Get timeline using natural language capabilities of Stagehand
    const tweets = await twitter.getTimeline({ count: 10 })
    console.log(tweets)
  }
  else {
    console.error('Login failed')
  }

  // Release resources
  await browser.close()
}
```

### 9.2 Integrating as AIRI Module

```typescript
import { AIRIAdapter, BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function startAIRIModule() {
  const browser = new BrowserBaseMCPAdapter(process.env.BROWSERBASE_API_KEY)
  await browser.initialize({ headless: true })

  const twitter = new TwitterService(browser)

  // Create AIRI adapter
  const airiAdapter = new AIRIAdapter(twitter, {
    url: process.env.AIRI_URL,
    token: process.env.AIRI_TOKEN
  })

  // Start adapter
  await airiAdapter.start()

  console.log('Twitter service running as AIRI module')
}
```

### 9.3 Using MCP for Integration

```typescript
// Use MCP SDK to interact with Twitter service
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

async function connectToTwitterService() {
  // Create SSE transport
  const transport = new SSEClientTransport('http://localhost:8080/sse', 'http://localhost:8080/messages')

  // Create client
  const client = new Client()
  await client.connect(transport)

  // Get timeline
  const timeline = await client.get('twitter://timeline/10')
  console.log('Timeline:', timeline.contents)

  // Use simplified login tool without parameters
  const loginResult = await client.useTool('login', {})
  console.log('Login result:', loginResult.content[0].text)

  // Use refresh timeline tool to get latest tweets
  const refreshResult = await client.useTool('refresh-timeline', { count: 15, includeReplies: false })
  console.log('Refresh result:', refreshResult.content[0].text)
  console.log('New tweets:', refreshResult.resources)

  // Get user profile information
  const profileResult = await client.useTool('get-my-profile', { username: 'twitter' })
  console.log('Profile info:', profileResult.content[0].text)

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
- **Session Management**: Use the built-in session management system to improve stability and reduce manual login requirements. Consider implementing session rotation and validation.
- **Cookie Management**: The system now automatically manages cookie storage via the SessionManager, but consider adding encrypted storage for production environments.
- **User Feedback**: Maintain clear, internationalized feedback messages for authentication status to improve user experience.

### 11.4 Stagehand Maintenance

- **Model Selection**: Regularly evaluate the performance of different LLM models (GPT-4o, Claude 3.5 Sonnet) for your specific use cases
- **Prompt Engineering**: Refine natural language instructions to improve reliability and performance
- **Vision Capabilities**: Consider enabling vision capabilities for complex DOM structures by setting `useVision: true` in appropriate operations
- **DOM Chunking**: Monitor and optimize chunk sizes based on the complexity of the Twitter interface

## 12. Project Roadmap

- MVP Stage: Core functionality with Stagehand integration (authentication, browsing timeline)
- Stage Two: Enhanced interaction features utilizing Stagehand's natural language capabilities
- Stage Three: Advanced search and filtering features with optimized LLM prompts
- Stage Four: Performance optimization and multi-model support
