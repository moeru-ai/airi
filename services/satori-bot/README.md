# AIRI Satori Bot

> **⚠️ Disclaimer**: This is a submodule of **AIRI**. The `core` part of this satori bot is merely a **temporary solution**. We will eventually delete it and integrate with **AIRI's Core** once the main framework is stable.

A **STANDALONE**, event-driven AI agent built on the [Satori Protocol](https://satori.chat/). It connects to multiple chat platforms (QQ, Telegram, Discord, Lark) via a Koishi bridge, featuring an autonomous thought loop.

## 🏗 Architecture & Internals (Provisional)

**Important**: This module currently implements a self-contained "Mini-Core" (`src/core/`) to operate independently. This is **NOT** the final architecture of AIRI.

* **Temporary Logic**: The Event Loop, Scheduler, and Planner logic located in `src/core/` are placeholders. They simulate the behavior of the future AIRI Core.
* **Retained Components**: The **Dispatcher** and **Database** will be retained. They will be exposed as **tool-like modules** to the AIRI Core for action execution and state persistence.
* **Future Migration**: Once the main AIRI Core is ready, the `src/core/` directory (specifically the loop/planning logic) will be removed. This module will then be refactored to strictly function as an **Adapter** (Satori Protocol handling) and **Capability Provider** (Actions), delegating the cognitive loop to the main AIRI process.

For the current standalone version, please refer to these documents:

* **[HANDLER.md](./docs/HANDLER.md)**: Explains the **current** Event-to-Action Flow (Queue -> Scheduler -> LLM).
* **[PERSISTENCE.md](./docs/PERSISTENCE.md)**: Details the **current** Memory-First state management strategy specific to this temporary core.

**Key Code Paths:**
* **Loop & Logic (Temporary)**: `src/core/`
* **Adapter (Permanent)**: `src/adapter/satori/`
* **Capabilities (Permanent)**: `src/capabilities/`

## Prerequisites

* **Node.js** >= 18.0.0
* **pnpm** >= 8.0.0
* **Koishi Instance**: Running the `server-satori` plugin.
* **LLM Provider**: OpenAI compatible API (Ollama, vLLM, DeepSeek, etc.).

## Quick Start

1. **Install Dependencies**
```bash
pnpm install
```

2. **Configure Environment**
Copy the example config and edit it:

```bash
cp .env .env.local
```

**Key Variables:**

```env
# Satori Configuration
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
SATORI_API_BASE_URL=http://localhost:5140/satori/v1
SATORI_TOKEN= # Optional: Leave empty if auth is disabled in Koishi

# LLM (OpenAI Compatible)
LLM_API_KEY=your_api_key_here
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
LLM_RESPONSE_LANGUAGE=English
LLM_OLLAMA_DISABLE_THINK=false
```

3. **Run**

```bash
# Development (Hot-reload)
pnpm --filter @proj-airi/satori-bot dev

# Production
pnpm --filter @proj-airi/satori-bot start
```

## Key Locations

* **Persona & System Prompts**: `src/core/planner/prompts/*.velin.md`
* **Database (JSON)**: `data/db.json` (See *PERSISTENCE.md* for limitations)
* **Action Logic**: `src/capabilities/actions/`
