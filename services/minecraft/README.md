# ⛏️ Minecraft agent player for [アイリ (AIRI)](https://airi.moeru.ai)

> [!NOTE]
>
> This project is part of the [Project アイリ (AIRI)](https://github.com/moeru-ai/airi), we aim to build a LLM-driven VTuber like [Neuro-sama](https://www.youtube.com/@Neurosama) (subscribe if you didn't!) if you are interested in, please do give it a try on [live demo](https://airi.moeru.ai).

An intelligent Minecraft bot powered by LLM. AIRI can understand natural language commands, interact with the world, and assist players in various tasks.

## 🎥 Preview

![demo](./docs/preview.avif)

## ✨ Features

- 🗣️ Natural language understanding
- 🏃‍♂️ Advanced pathfinding and navigation
- 🛠️ Block breaking and placing
- 🎯 Combat and PvP capabilities
- 🔄 Auto-reconnect on disconnection
- 📦 Inventory management
- 🤝 Player following and interaction
- 🌍 World exploration and mapping

## 🚀 Getting Started

### 📋 Prerequisites

- 📦 Node.js 23+
- 🔧 pnpm
- 🎮 A Minecraft server (1.20+)

### 🔨 Installation

1. Clone the repository:

```bash
git clone https://github.com/moeru-ai/airi.git
cd services/minecraft
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env.local` file with your configuration:

> [!NOTE]
> For all online accounts, un-comment the following line to toggle Microsoft authentication.
> Link for authentication will popup when the bot starts.
>
> After signed in, according to [how Minecraft protocol was implemented](https://github.com/PrismarineJS/node-minecraft-protocol/blob/bf89f7e86526c54d8c43f555d8f6dfa4948fd2d9/src/client/microsoftAuth.js#L7-L16)
> and also, [authentication flow implemented here](https://github.com/PrismarineJS/prismarine-auth/blob/1aef6e1387d94fca839f2811d17ac6659ae556b4/src/MicrosoftAuthFlow.js#L59-L69),
> the token will be cached with [the cache IDs specified here](https://github.com/PrismarineJS/prismarine-auth/blob/1aef6e1387d94fca839f2811d17ac6659ae556b4/src/MicrosoftAuthFlow.js#L88-L93)
> in split files:
>
> - `${hash}_live-cache.json`
> - `${hash}_mca-cache.json`
> - `${hash}_xbl-cache.json`
>
> inside of the directory provided by [`minecraft-folder-path`](https://github.com/simonmeusel/minecraft-folder-path)
>
> Linux: `~/.minecraft/nmp-cache/`
> macOS: `~/Library/Application Support/minecraft/nmp-cache/`
> Windows: `%appdata%/.minecraft/nmp-cache/`
>
> where `${hash}` is the `sha1` hash of the username you signing in with (as Minecraft username).

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_BASEURL=your_openai_api_baseurl

BOT_USERNAME=your_bot_username
BOT_HOSTNAME=localhost
BOT_PORT=25565
BOT_AUTH='microsoft' # comment if you use offline mode
BOT_VERSION=1.20
```

1. Start the bot:

```bash
pnpm dev
```

## 🎮 Usage

Once the bot is connected, you can interact with it using chat commands in Minecraft. All commands start with `#`.

### Basic Commands

- `#help` - Show available commands
- `#follow` - Make the bot follow you
- `#stop` - Stop the current action
- `#come` - Make the bot come to your location

### Natural Language Commands

You can also give the bot natural language commands, and it will try to understand and execute them. For example:

- "Build a house"
- "Find some diamonds"
- "Help me fight these zombies"
- "Collect wood from nearby trees"

## 🧠 Cognitive Architecture

AIRI's Minecraft agent is built on a **four-layered cognitive architecture** inspired by cognitive science, enabling reactive, conscious, and physically grounded behaviors.

### Architecture Overview

```mermaid
graph TB
    subgraph "Layer A: Perception"
        Events[Raw Events]
        EM[Event Manager]
        Events --> EM
    end

    subgraph "Layer B: Reflex (Subconscious)"
        RM[Reflex Manager]
        FSM[State Machine]
        RM --> FSM
    end

    subgraph "Layer C: Conscious (Reasoning)"
        ORC[Orchestrator]
        Planner[Planning Agent (LLM)]
        Chat[Chat Agent (LLM)]
        ORC --> Planner
        ORC --> Chat
    end

    subgraph "Layer D: Action (Execution)"
        TE[Task Executor]
        AA[Action Agent]
        Planner -->|Plan| TE
        TE -->|Action Steps| AA
    end

    EM -->|High Priority| RM
    EM -->|All Events| ORC
    RM -.->|Inhibition Signal| ORC
    ORC -->|Execution Request| TE

    style EM fill:#e1f5ff
    style RM fill:#fff4e1
    style ORC fill:#ffe1f5
    style TE fill:#dcedc8
```

### Layer A: Perception

**Location**: `src/cognitive/perception/`

The perception layer acts as the sensory input hub, receiving and preprocesses all events from the Minecraft world and external sources.

**Components**:
- **Event Manager** (`event-manager.ts`): Centralized event distribution system
  - Emits standardized `BotEvent` objects
  - Supports event prioritization and concurrency

### Layer B: Reflex

**Location**: `src/cognitive/reflex/`

The reflex layer handles immediate, instinctive reactions. It operates on a finite state machine (FSM) pattern for predictable, fast responses.

**Components**:
- **Reflex Manager** (`reflex-manager.ts`): Coordinates reflex behaviors
- **Inhibition**: Reflexes can inhibit Conscious layer processing to prevent redundant responses.

### Layer C: Conscious

**Location**: `src/cognitive/conscious/`

The conscious layer handles complex reasoning, planning, and high-level decision-making. No physical execution happens here anymore.

**Components**:
- **Orchestrator**: Coordinates "Thinking" vs "Chatting" tasks.
- **Task Manager**: Manages concurrent Primary (Physical) and Secondary (Mental) tasks.
- **Planning Agent**: pure LLM reasoning to generate plans.
- **Chat Agent**: Generates natural language responses.

### Layer D: Action

**Location**: `src/cognitive/action/`

The action layer is responsible for the actual execution of tasks in the world. It isolates "Doing" from "Thinking".

**Components**:
- **Task Executor**: Receives a `Plan` and executes it step-by-step. Handles retry logic and errors.
- **Action Agent**: The interface to low-level Mineflayer skills (move, place, break).

### 🔄 Event Flow Example

**Scenario: "Build a house"**
```
Player: "build a house"
  ↓
[Perception] Event detected
  ↓
[Conscious] Architect plans the structure
  ↓
[Action] Executor takes the plan and manages the construction loop:
    - Step 1: Collect wood (calls ActionAgent)
    - Step 2: Craft planks
    - Step 3: Build walls
  ↓
[Conscious] ChatAgent confirms completion: "House is ready!"
```

### 📁 Project Structure

```
src/
├── cognitive/                  # 🧠 Perception → Reflex → Conscious → Action
│   ├── perception/            # Event ingestion
│   │   └── event-manager.ts   # Normalizes raw Mineflayer events
│   ├── reflex/                # Fast, rule-based reactions
│   │   └── reflex-manager.ts
│   ├── conscious/             # LLM-powered reasoning
│   │   ├── blackboard.ts      # Shared working memory
│   │   ├── brain.ts           # Core reasoning loop/orchestration
│   │   ├── completion.ts      # LLM completion helper
│   │   ├── handler.ts         # Routes stimuli into the brain
│   │   ├── task-manager.ts    # Manages concurrent tasks
│   │   ├── task-state.ts      # Task lifecycle enums/helpers
│   │   └── prompts/           # Prompt definitions (e.g., brain-prompt.ts)
│   ├── action/                # Task execution layer
│   │   ├── task-executor.ts   # Executes planned steps with retries
│   │   └── types.ts
│   ├── container.ts           # Dependency injection wiring
│   ├── index.ts               # Cognitive system entrypoint
│   └── types.ts               # Shared cognitive types
├── agents/                    # Specialized agents
│   ├── action/               # Low-level actuator bridge
│   ├── planning/             # Goal planner (LLM)
│   ├── chat/                 # Conversational responses
│   └── memory/               # Memory-related helpers
├── libs/
│   └── mineflayer/           # Mineflayer bot wrapper/adapters
├── skills/                   # Atomic bot capabilities
├── composables/              # Reusable functions (config, etc.)
├── plugins/                  # Mineflayer/bot plugins
├── web/                      # Debug web dashboard
├── utils/                    # Helpers
├── debug-server.ts           # Local debug server entry
└── main.ts                   # Bot entrypoint
```

### 🎯 Design Principles

1. **Separation of Concerns**: Each layer has a distinct responsibility
2. **Event-Driven**: Loose coupling via centralized event system
3. **Inhibition Control**: Reflexes prevent unnecessary LLM calls
4. **Extensibility**: Easy to add new reflexes or conscious behaviors
5. **Cognitive Realism**: Mimics human-like perception → reaction → deliberation

### 🚧 Future Enhancements

- **Perception Layer**:
  - ⏱️ Temporal context window (remember recent events)
  - 🎯 Salience detection (filter noise, prioritize important events)

- **Reflex Layer**:
  - 🏃 Dodge hostile mobs
  - 🍖 Auto-eat when health/hunger is low
  - 🛡️ Emergency combat responses

- **Conscious Layer**:
  - 💭 Emotional state management
  - 🧠 Long-term memory integration
  - 🎭 Personality-driven responses

## 🛠️ Development

### Commands

- `pnpm dev` - Start the bot in development mode
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests

## 🙏 Acknowledgements

- https://github.com/kolbytn/mindcraft

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
