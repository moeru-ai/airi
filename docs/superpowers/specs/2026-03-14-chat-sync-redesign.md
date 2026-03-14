# Chat Sync Redesign: HTTP sync → WebSocket + REST

## Problem

The current `POST /api/chats/sync` endpoint has several design issues:

- Full-push model with no incremental sync — wastes bandwidth on already-synced messages
- No server→client push — clients can't receive messages from other devices
- Single endpoint mixes chat creation, member management, and message sync
- `senderId` stores role string literals ("assistant", "system") as IDs
- Client-controlled timestamps are untrustworthy
- N+1 queries for member management
- No message count limits per request
- `onConflictDoUpdate` overwrites content despite messages being conceptually append-only

## Solution

Split responsibilities between WebSocket (message sync) and REST (chat management), connected via eventa RPC protocol.

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────────────┐
│  Client A   │◄──────────────────────────►│                      │
│ (stage-ui)  │    eventa protocol         │   apps/server        │
└─────────────┘                            │                      │
                                           │  ┌────────────────┐  │
┌─────────────┐         WebSocket          │  │  Hono HTTP     │  │
│  Client B   │◄──────────────────────────►│  │  (REST routes) │  │
│ (stage-ui)  │    eventa protocol         │  └────────────────┘  │
└─────────────┘                            │                      │
                                           │  ┌────────────────┐  │
                                           │  │  WS endpoint   │  │
                                           │  │  /ws/chat      │  │
                                           │  │  (eventa ctx)  │  │
                                           │  └────────────────┘  │
                                           │                      │
                                           │  ┌────────────────┐  │
                                           │  │  ChatService   │  │
                                           │  │  (DB + seq)    │  │
                                           │  └────────────────┘  │
                                           └──────────────────────┘
```

### Responsibility Split

- **WS `/ws/chat`** — Message sync only: push messages, receive real-time messages, incremental pull via per-chat sequence numbers
- **REST `/api/chats`** — Chat lifecycle: create, update metadata/title, manage members, delete

## eventa Hono WebSocket Adapter

A new adapter bridging Hono's WebSocket (`@hono/node-ws`) to eventa contexts. Lives at `apps/server/src/libs/eventa-hono-adapter.ts`, to be migrated to the eventa package later.

### API

```ts
import { createPeerHooks } from './eventa-hono-adapter'

app.get('/ws/chat', upgradeWebSocket((c) => {
  const hooks = createPeerHooks({
    onContext: (ctx) => {
      registerChatHandlers(ctx, chatService, userId)
    }
  })
  return hooks // { onOpen, onMessage, onClose, onError }
}))
```

### Implementation Requirements

- Bridges Hono `WSEvents` (onOpen/onMessage/onClose/onError) to eventa event system
- Uses eventa standard `WebsocketPayload { id, type, payload, timestamp }` format
- Tags events with Inbound/Outbound direction to prevent loops
- Auto-cleans listeners on connection close
- Exports `wsConnectedEvent` / `wsDisconnectedEvent` lifecycle events

## WS Message Protocol (eventa RPC Events)

Defined in a shared module, imported by both client and server:

```ts
// apps/server/src/api/chat-events.ts
import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

// Push messages to a chat (chat must already exist)
export const sendMessages = defineInvokeEventa<
  { seq: number },
  { chatId: string, messages: { id: string, role: string, content: string }[] }
>('chat:send-messages')

// Pull messages incrementally
export const pullMessages = defineInvokeEventa<
  { messages: Message[], seq: number },
  { chatId: string, afterSeq: number, limit?: number }
>('chat:pull-messages')

// Server pushes new messages to other devices (outbound only)
export const newMessage = defineOutboundEventa<
  { chatId: string, message: Message, seq: number }
>('chat:new-message')
```

### Sync Flow

1. Device A calls `sendMessages` RPC → server writes to DB, assigns seq, returns `{ seq }`
2. Server emits `newMessage` to all other connections of the same user
3. Device B receives `newMessage` in real-time, or uses `pullMessages` to catch up on missed messages

## Database Changes

### messages table

**Add column:**

```ts
seq: integer('seq').notNull()
// UNIQUE(chat_id, seq) constraint
```

- Per-chat auto-increment, computed server-side as `MAX(seq) + 1`
- Unique constraint `UNIQUE(chat_id, seq)` prevents concurrency issues
- Clients use `afterSeq` for incremental pulls

**Modify upsert behavior:**

- Keep `onConflictDoUpdate` on message ID, but only update `content` and `updatedAt`
- Do NOT update `role`, `senderId`, `seq`, `createdAt`
- If `updatedAt > createdAt`, the message has been edited (no separate `editedAt` column needed)

**senderId improvement:**

- Non-user roles: store `characterId` if available, otherwise `null`
- Make `senderId` column nullable
- Stop storing role string literals ("assistant", "system") as sender IDs

**Timestamps:**

- `createdAt` and `updatedAt` always set by server, never accepted from client

## REST Endpoints

### Remove

- `POST /api/chats/sync` — deleted entirely

### Chat CRUD

```
POST   /api/chats                          — Create chat
GET    /api/chats                          — List user's chats
GET    /api/chats/:id                      — Get chat details
PATCH  /api/chats/:id                      — Update chat (title)
DELETE /api/chats/:id                      — Soft-delete chat
```

### Member Management

```
POST   /api/chats/:id/members             — Add member
DELETE /api/chats/:id/members/:memberId    — Remove member
```

### Chat ID Generation (Hybrid)

- `POST /api/chats` accepts optional `id` field
- If client provides `id`: validate format (nanoid length/charset), use if valid
- If not provided: server generates nanoid
- Returns `{ id, ... }`

### Authentication

- All endpoints use `authGuard` middleware (better-auth)
- Chat operations verify membership (only members can operate on a chat)

## WS Authentication

- Token passed via query param: `/ws/chat?token=xxx`
- Validated with better-auth before WebSocket upgrade
- Rejected with 401 if invalid

## Multi-Device Push

- Server maintains `Map<userId, Set<EventContext>>` for active connections
- On message write: iterate other contexts for the same user, emit `newMessage`
- Connections cleaned up from the map on disconnect

## Observability

### Metrics (OTEL)

- `ws.connections.active` — Active WS connection count (gauge)
- `ws.messages.sent` — Outbound message count
- `ws.messages.received` — Inbound message count
- Retain existing `chat.sync` and `chat.messages` metrics

### Logging (logg)

- WS connect/disconnect (with userId)
- RPC calls (sendMessages / pullMessages)
- Auth failures
- Errors (write failures, chat not found, etc.)

## File Changes

| File | Change |
|------|--------|
| `apps/server/src/libs/eventa-hono-adapter.ts` | New: eventa Hono WS adapter |
| `apps/server/src/api/chat-events.ts` | New: eventa RPC event definitions |
| `apps/server/src/routes/chat-ws.ts` | New: WS endpoint `/ws/chat`, RPC handler registration |
| `apps/server/src/routes/chats.ts` | Rewrite: remove `/sync`, replace with REST CRUD |
| `apps/server/src/api/chats.schema.ts` | Rewrite: validation schemas for REST endpoints |
| `apps/server/src/services/chats.ts` | Rewrite: split into chat management + message sync methods |
| `apps/server/src/schemas/chats.ts` | Modify: add `seq` column, make `senderId` nullable |
| `apps/server/src/app.ts` | Modify: mount WS route, init `@hono/node-ws` |

## Non-Goals

- Client-side implementation (stage-ui changes)
- Chat history search/filtering
- Message reactions, threads, or forwarding
- Rate limiting (can be added later)
- Audit/edit history table
