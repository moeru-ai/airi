# Core Message Flow Architecture

This document outlines the complete lifecycle of a message within the Satori Bot, from the initial WebSocket event to the LLM's decision-making process.

## 1. Architectural Overview

The bot operates on a **Event-Driven + Autonomous Loop** hybrid model:
* **Event Layer**: Handles raw WebSocket signals, deduplication, and queuing.
* **Scheduler Layer**: Consumes the queue, updates the internal "Unread Pool" state, and triggers channel-specific processing loops.
* **Planner Layer**: The LLM acts as an Agent that observes the "Unread Pool" and "History Actions" state to decide whether to `read_unread_messages` (observe) or `send_message` (act).

---

## 2. Detailed Data Flow

### Phase 1: Ingress
**Location:** `src/adapter/satori/client.ts` → `src/core/loop/queue.ts`

1.  **WebSocket Reception**: The `SatoriClient` receives a raw JSON signal and parses it into a `SatoriEvent`.
2.  **Event Listener**: The `setupMessageEventHandler` (in `queue.ts`) listens for `message-created` events.
3.  **Deduplication**: The system checks the `processedIds` set (key: `channelId-messageId`) to prevent double-processing.
4.  **Enqueuing**:
    * The raw `event` is wrapped into a `{ event, status: 'ready' }` object.
    * It is pushed into `botContext.eventQueue`.
    * **Key Data**: `event.message.content`, `event.user.id`, `event.channel.id`.

### Phase 2: Consumption & Anchoring
**Location:** `src/core/loop/scheduler.ts` (Function: `onMessageArrival`)

When the system processing lock is free, it consumes events from the `eventQueue`:

1.  **Context Initialization**:
    * Extracts `channelId`.
    * Calls `ensureChatContext` (in `src/core/session/context.ts`) to load or create the in-memory `ChatContext` for that channel.
    * **Anchor**: The `event.channel.id` is the primary key for all context.
2.  **Filtering**:
    * Checks `selfId`. If the sender is the bot itself, the event is discarded (not counted as unread) to prevent infinite loops.
3.  **State Update (The "Unread Pool")**:
    * The event is pushed into `botContext.unreadEvents[channelId]`.
    * *Note:* This step does **not** just store the message; it marks the event as a "pending observation object".
4.  **Loop Trigger**:
    * Immediately calls `loopIterationForChannel`, waking up the Agent Loop for this specific channel.

### Phase 3: Reasoning (LLM)
**Location:** `src/core/loop/scheduler.ts` → `src/core/planner/llm-client.ts`

The LLM is prompted not to "reply to this text," but to "decide the next action based on state."

1.  **Context Construction (`imagineAnAction`)**:
    * **System**: Injects `system-action-gen-v1` (Tool Definitions) and `personality-v1` (Persona).
    * **Short-term Memory**: Injects `chatContext.messages` (Recent conversation turns).
    * **Global State (Crucial)**: The prompt explicitly states: *"You have X unread events."* and lists the contents of `botContext.unreadEvents`.
    * **Incoming Injection**: If there is an incoming message stream, it is injected as an `Incoming events` block at the end of the prompt.
    * **Action History**: Injects `chatContext.actions` to show the results of previous attempts (e.g., "Last action: read_messages, Result: Success").
2.  **Generation**:
    * The LLM outputs a strictly formatted JSON Action, e.g., `{"action": "read_unread_messages", "channelId": "..."}`.

### Phase 4: Dispatch & Execution
**Location:** `src/core/dispatcher.ts` → `src/capabilities/registry.ts`

The system looks up the corresponding Handler in `globalRegistry` based on the JSON Action:

* **Case: `read_unread_messages`** (`src/capabilities/actions/read-messages.ts`)
    * **Logic**: Retrieves all backlog events from `botContext.unreadEvents` for the specified channel.
    * **Formatting**: Converts them into a single text block (e.g., `[User]: Content`).
    * **Result**: Stores this text in the `Action Result`.
    * **State Change**: Clears the `unreadEvents` for that channel. In the **next Tick**, the LLM will see this text in its History Actions and generate a reply.

* **Case: `send_message`** (`src/capabilities/actions/send-message.ts`)
    * **Safety Check**: Checks `unreadEvents` again. If new messages arrived during generation, it might abort the send to prioritize reading.
    * **Execution**: Calls `satoriClient.sendMessage`.
    * **Recording**: Persists the response to the DB and the in-memory `messages` array.

### Phase 5: Loop Continuation
**Location:** `src/core/loop/scheduler.ts` (`handleLoopStep`)

* `dispatchAction` returns an `ActionResult` containing a `shouldContinue` flag.
* If `shouldContinue` is true (e.g., usually true after reading messages, as a reply is expected), the scheduler waits for `LOOP_CONTINUE_DELAY_MS` (default 2.5s) and then recursively calls `handleLoopStep`.
* **Termination**: The loop stops only when the LLM selects the `continue` action (Wait/Stop) or the `break` action.
