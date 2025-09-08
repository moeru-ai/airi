# LLM Provider Setup Guide

The Memory Service supports multiple LLM providers for intelligent message analysis and memory creation.

## Environment Variables

Set these environment variables to configure your LLM provider:

```bash
# LLM Configuration
LLM_PROVIDER=openai          # Options: 'openai', 'gemini', 'fallback'
LLM_MODEL=gpt-4              # Model name (optional, uses defaults if not specified)
LLM_API_KEY=your_api_key     # API key for your chosen provider
```

## Available Providers

### 1. OpenAI Provider
- **Provider**: `LLM_PROVIDER=openai`
- **Default Model**: `gpt-4-turbo-preview`
- **API Key**: Required from [OpenAI Platform](https://platform.openai.com/)
- **Features**:
  - Structured JSON output with `response_format: "json_object"`
  - High-quality reasoning
  - Consistent performance
- **Compatible Models**:
  - `gpt-4-turbo-preview` ✅ (Recommended)
  - `gpt-4` ✅
  - `gpt-4-turbo` ✅
  - `gpt-3.5-turbo` ✅
  - `gpt-3.5-turbo-16k` ✅
- **Incompatible Models**:
  - `gpt-3.5` ❌ (No structured output support)
  - `text-davinci-003` ❌ (Legacy model)

### 2. Gemini Provider
- **Provider**: `LLM_PROVIDER=gemini`
- **Default Model**: `gemini-pro`
- **API Key**: Required from [Google AI Studio](https://makersuite.google.com/)
- **Features**:
  - Cost-effective
  - Good JSON parsing
  - Google's latest models

### 3. Fallback Provider (Default)
- **Provider**: `LLM_PROVIDER=fallback` or not set
- **API Key**: Not required
- **Features**:
  - No external dependencies
  - Simple heuristic-based analysis
  - Good for development and testing
  - No API costs

## Configuration Examples

### OpenAI Setup
```bash
export LLM_PROVIDER=openai
export LLM_MODEL=gpt-4-turbo
export LLM_API_KEY=sk-...
```

### Gemini Setup
```bash
export LLM_PROVIDER=gemini
export LLM_MODEL=gemini-1.5-pro
export LLM_API_KEY=AIza...
```

### Fallback Setup (Development)
```bash
export LLM_PROVIDER=fallback
# No API key needed
```

## Installation

Install the required packages for your chosen provider:

### OpenAI
```bash
npm install openai
```

### Gemini
```bash
npm install @google/generative-ai
```

### Fallback
No additional packages required.

## Usage

The system automatically selects the appropriate provider based on your environment variables:

```typescript
// The LLMMemoryManager automatically uses the configured provider
const llmManager = new LLMMemoryManager()
await llmManager.processBatch(messages)
```

## Fallback Behavior

If you specify a provider but don't provide an API key, the system automatically falls back to the heuristic provider:

```bash
export LLM_PROVIDER=openai
# export LLM_API_KEY=...  # Missing API key
# System will automatically use fallback provider
```

## Testing

Test your configuration by sending a message to the API:

```bash
curl -X POST http://localhost:3001/api/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "I have an important work goal to finish the project by next week", "platform": "test"}'
```

Check the logs to see which provider is being used and if the LLM processing is working correctly.
