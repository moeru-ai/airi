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

The perception layer acts as the sensory input hub, collecting raw Mineflayer signals and translating them into typed events/signals through an event registry + rule engine pipeline.

**Pipeline**:
- Event definitions in `events/definitions/*` bind Mineflayer events to normalized raw events.
- `EventRegistry` emits `raw:<modality>:<kind>` events to the cognitive event bus.
- `RuleEngine` evaluates YAML rules and emits derived `signal:*` events consumed by Reflex/Conscious layers.

**Key files**:
- `events/index.ts`
- `events/definitions/*`
- `rules/engine.ts`
- `rules/*.yaml`
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
- **Brain** (`brain.ts`): Event queue orchestration, LLM turn lifecycle, safety/budget guards, debug REPL integration.
- **JavaScript Planner** (`js-planner.ts`): Sandboxed planning/runtime execution against exposed tools/globals.
- **Query Runtime** (`query-dsl.ts`): Read-only world/inventory/entity query helpers for planner scripts.
- **Task State** (`task-state.ts`): Cancellation token and task lifecycle primitives used by action execution.

### Layer D: Action

**Location**: `src/cognitive/action/`

The action layer is responsible for the actual execution of tasks in the world. It isolates "Doing" from "Thinking".

**Components**:
- **Task Executor** (`task-executor.ts`): Runs normalized action instructions and emits action lifecycle events.
- **Action Registry** (`action-registry.ts`): Validates params and dispatches tool calls.
- **Tool Catalog** (`llm-actions.ts`): Action/tool definitions and schemas bound to mineflayer skills.

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
    - Step 1: Collect wood (calls ActionRegistry tool)
    - Step 2: Craft planks
    - Step 3: Build walls
  ↓
[Conscious] Brain confirms completion: "House is ready!"
```

### 📁 Project Structure

```
src/
├── cognitive/                  # 🧠 Perception → Reflex → Conscious → Action
│   ├── perception/            # Event definitions + rule evaluation
│   │   ├── events/
│   │   │   ├── index.ts
│   │   │   └── definitions/*
│   │   ├── rules/
│   │   │   ├── *.yaml
│   │   │   ├── engine.ts
│   │   │   ├── loader.ts
│   │   │   └── matcher.ts
│   │   └── pipeline.ts
│   ├── reflex/                # Fast, rule-based reactions
│   │   ├── reflex-manager.ts
│   │   ├── runtime.ts
│   │   ├── context.ts
│   │   └── behaviors/idle-gaze.ts
│   ├── conscious/             # LLM-powered reasoning
│   │   ├── brain.ts           # Core reasoning loop/orchestration
│   │   ├── js-planner.ts      # JS planning sandbox
│   │   ├── query-dsl.ts       # Read-only query runtime
│   │   ├── llm-log.ts         # Turn/log query helpers
│   │   ├── task-state.ts      # Task lifecycle enums/helpers
│   │   └── prompts/           # Prompt definitions (e.g., brain-prompt.ts)
│   ├── action/                # Task execution layer
│   │   ├── task-executor.ts   # Executes actions and emits lifecycle events
│   │   ├── action-registry.ts # Tool dispatch + schema validation
│   │   ├── llm-actions.ts     # Tool catalog
│   │   └── types.ts
│   ├── event-bus.ts           # Event bus core
│   ├── container.ts           # Dependency injection wiring
│   ├── index.ts               # Cognitive system entrypoint
│   └── types.ts               # Shared cognitive types
├── libs/
│   └── mineflayer/           # Mineflayer bot wrapper/adapters
├── skills/                   # Atomic bot capabilities
├── composables/              # Reusable functions (config, etc.)
├── plugins/                  # Mineflayer/bot plugins
├── debug/                    # Debug web dashboard + MCP bridge
├── utils/                    # Helpers
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
