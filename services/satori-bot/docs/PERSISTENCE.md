## **Architecture Status Report: Memory & Persistence**

**Date:** March 6, 2026 (Refactored)
**Component:** State Management Layer (Drizzle + PGlite)

### **1. Memory Architecture (RAM)**

The bot utilizes a **Memory-First** strategy for active chat sessions, while persisting critical queue and message data to disk.

* **Storage Mechanism**: Active chat contexts are stored in a native `Map<string, ChatContext>` within the `BotContext` object (`src/core/types.ts`).
* **Lifecycle Management**:
    * **Creation**: Contexts are lazy-loaded via `ensureChatContext` in `src/core/session/context.ts` upon receiving a message.
    * **Retention**: Currently, contexts remain in memory until process termination. History is trimmed during the loop.
* **Context Trimming**:
    * Executed within `handleLoopStep` in `src/core/loop/scheduler.ts`.
    * Individual channels enforce strict limits: `MAX_ACTIONS_IN_CONTEXT = 50`, `ACTIONS_KEEP_ON_TRIM = 20`.
    * Message history is dynamically fetched from the database (last 10 messages) to keep the LLM context lean.

### **2. Persistence Architecture (Database)**

The bot has migrated from `lowdb` (JSON) to **PGlite** (PostgreSQL in WASM/Node) with **Drizzle ORM** for robust state management and high-performance I/O.

* **Technology**: [PGlite](https://pglite.dev/) + [Drizzle ORM](https://orm.drizzle.team/).
* **Location**: `data/` directory (configured via `DB_PATH` in `.env.local`).
* **Schema (`src/lib/schema.ts`)**:
    * `channels`: Metadata for discovered channels (ID, name, platform, self_id).
    * `messages`: Persistent message log with indexing on `channel_id` and `timestamp`.
    * `event_queue`: Persistent queue for incoming Satori events awaiting processing.
    * `unread_events`: Persistent store for events marked as unread for each channel.
* **Optimized I/O Strategy**:
    * **Incremental Updates**: Unlike the previous "full-rewrite" approach, the bot now uses targeted SQL operations.
    * **Queue Management**: Individual items are added (`pushToEventQueue`) and removed (`removeFromEventQueue`) by ID.
    * **Unread Tracking**: Unread messages are persisted incrementally (`pushToUnreadEvents`) and cleared per channel (`clearUnreadEventsForChannel`).
* **Migrations**: Managed via `drizzle-kit`. Migrations are automatically applied on startup in `src/lib/db.ts`.

### **3. State Consistency & Recovery**

The gap between ephemeral memory and persistent disk state has been significantly narrowed.

* **Durable Queue**: The `eventQueue` and `unreadEvents` are fully persisted. If the bot crashes, it resumes processing the queue from where it left off.
* **Message History**: The LLM's conversation history is reconstructed from the indexed `messages` table in the database, ensuring continuity across restarts.
* **Hard Reset Mitigation**: While `AbortController` handles are still lost on restart, the core task queue and conversation context remain intact.

### **4. Configuration**

Database settings are managed through `src/config.ts`:
* `DB_PATH`: Path to the PGlite data directory (default: `data/pglite-db`).
