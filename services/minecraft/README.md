# WIP

**Caution: Documentation below may be out of date.**

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

The perception layer acts as the sensory input hub, collecting raw signals from Mineflayer and turning them into higher-level, rate-limited perception events.

**Pipeline**:
- Mineflayer listeners collect **raw perception events** (sight/hearing/felt), including distance and line-of-sight when applicable.
- Raw events are queued in a buffer and drained on the cognitive tick.
- An attention detector aggregates events via leaky buckets and emits attention/perception events **only on threshold crossing** (e.g. sustained movement, punching, teabagging, interesting sounds).

**Key files**:
- `mineflayer-perception-collector.ts`
- `raw-events.ts`
- `raw-event-buffer.ts`
- `attention-detector.ts`
- `pipeline.ts`

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
│   │   ├── mineflayer-perception-collector.ts
│   │   ├── raw-events.ts
│   │   ├── raw-event-buffer.ts
│   │   ├── attention-detector.ts
│   │   └── pipeline.ts
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
