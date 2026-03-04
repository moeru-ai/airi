## **Architecture Status Report: Memory & Persistence**

**Date:** February 9, 2026 (Refactored)
**Component:** State Management Layer

### **1. Memory Architecture (RAM)**

The bot utilizes a **Memory-First** strategy, where the active state is fully resident in the Node.js heap.

* **Storage Mechanism**: All chat contexts are stored in a native `Map<string, ChatContext>` within the `BotContext` object (`src/core/types.ts`).
* **Lifecycle Management**:
    * **Creation**: Contexts are lazy-loaded via `ensureChatContext` in `src/core/session/context.ts` upon receiving a message.
    * **Retention**: There is currently **no garbage collection (GC)** mechanism. Once a channel is loaded, its context remains in memory indefinitely until the process terminates.
* **Context Trimming**:
    * Executed within `handleLoopStep` in `src/core/loop/scheduler.ts`.
    * Individual channels enforce a strict limit on history length (Default: 20 messages, 50 actions) to prevent single-channel bloat.
    * **Risk**: The architecture is susceptible to memory leaks (OOM) as the number of unique channels increases over time.

### **2. Persistence Architecture (Disk)**

The bot uses a file-based logging system primarily for archival purposes and basic metadata recovery upon restart, rather than for active state management.

* **Technology**: `lowdb` with a JSON file adapter.
* **Location**: `src/lib/db.ts` -> `data/db.json`.
* **Data Structure**:
    * `channels`: Stores metadata like Channel ID, Platform, and SelfID.
    * `messages`: A global, flattened array of messages.
* **Write Strategy**: **Synchronous full-file serialization**. Every new message triggers a complete rewrite of the JSON file to disk.
* **Retention Policy**: A global hard limit of **1000 messages** is enforced. When the limit is reached, the oldest messages are discarded regardless of which channel they belong to.
* **Recovery Logic**: Upon restart, `ensureChatContext` queries `db.channels` to restore the channel's `platform` and `selfId`, but it **does not** load historical messages into the in-memory context.

### **3. State Consistency**

There is a significant desynchronization between the ephemeral memory state and the persistent disk state.

* **In-Memory State (Rich)**: Contains the full "Chain of Thought" (System prompts, reasoning steps, `AbortController` handles, pending Promises, `Action History`).
* **On-Disk State (Flat)**: Contains only raw user content and final bot responses.
* **Impact**: A process restart results in a **Hard Context Reset**. The bot loses all active "trains of thought" and task states, falling back to a state driven solely by new incoming messages.

### **4. Future Roadmap (WIP)**

We are planning to implement a "Small Memory" storage scheme to improve robustness, featuring:

1.  **Indiscriminate Event Storage**: Storing all events without preemptive filtering.
2.  **Event Activation Query**: Triggering queries based on specific event activation signals.
3.  **Dynamic Context Filtering**: Reconstructing same-group contexts via query-time filtering rather than pre-computed buckets.
