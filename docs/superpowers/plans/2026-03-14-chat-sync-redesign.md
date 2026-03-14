# Chat Sync Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic HTTP `POST /api/chats/sync` endpoint with WebSocket-based message sync (eventa RPC) + REST chat management.

**Architecture:** WS `/ws/chat` handles message push/pull/broadcast via eventa RPC with per-chat sequence numbers. REST `/api/chats` handles chat CRUD and member management. A new eventa Hono adapter bridges Hono's WebSocket to eventa contexts.

**Tech Stack:** Hono, `@hono/node-ws`, `@moeru/eventa`, Drizzle ORM, PostgreSQL, better-auth, `@guiiai/logg`, OpenTelemetry

**Spec:** `docs/superpowers/specs/2026-03-14-chat-sync-redesign.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/server/src/schemas/chats.ts` | DB schema: add `seq` column, make `senderId` nullable |
| `apps/server/src/libs/eventa-hono-adapter.ts` | New: bridge Hono WSEvents → eventa EventContext (per-peer) |
| `apps/server/src/libs/eventa-hono-adapter.test.ts` | Tests for the adapter |
| `packages/server-sdk/src/events/chat.ts` | New: shared eventa RPC event definitions + WireMessage type |
| `packages/server-sdk/src/index.ts` | Re-export chat events |
| `apps/server/src/services/chats.ts` | Rewrite: split into chat management + message sync |
| `apps/server/src/services/__test__/chats.test.ts` | New: tests for chat service |
| `apps/server/src/api/chats.schema.ts` | Rewrite: validation schemas for REST endpoints |
| `apps/server/src/routes/chats.ts` | Rewrite: REST CRUD for chats + members |
| `apps/server/src/routes/chat-ws.ts` | New: WS endpoint, RPC handler registration, multi-device push |
| `apps/server/src/libs/otel.ts` | Modify: add WS metrics to EngagementMetrics |
| `apps/server/src/app.ts` | Modify: mount WS route, init `@hono/node-ws`, add deps |

---

## Chunk 1: Database Schema + Shared Event Definitions

### Task 1: Update DB schema — add `seq`, make `senderId` nullable

**Files:**
- Modify: `apps/server/src/schemas/chats.ts`

- [ ] **Step 1: Add `seq` column and update `senderId` in messages table**

In `apps/server/src/schemas/chats.ts`, modify the `messages` table:

```ts
// Add to messages table definition:
seq: integer('seq'),  // nullable initially for migration, will be set NOT NULL after backfill

// Change senderId from:
senderId: text('sender_id').notNull(),
// to:
senderId: text('sender_id'),
```

Also add `integer` and `uniqueIndex` to imports:

```ts
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
```

The composite unique constraint on `(chat_id, seq)` will be added in the migration SQL (Task 9), not in the Drizzle schema definition, since Drizzle's `pgTable` third-argument constraint syntax varies by version. The migration SQL will include:
```sql
CREATE UNIQUE INDEX messages_chat_id_seq_unique ON messages (chat_id, seq);
```

- [ ] **Step 2: Generate migration**

Run: `cd apps/server && pnpm db:generate`
Expected: Migration SQL file generated in drizzle output directory.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/schemas/chats.ts
git commit -m "feat(server): add seq column and make senderId nullable on messages table"
```

---

### Task 2: Create shared event definitions in server-sdk

**Files:**
- Create: `packages/server-sdk/src/events/chat.ts`
- Modify: `packages/server-sdk/src/index.ts`

- [ ] **Step 1: Install eventa dependency in server-sdk**

Run: `cd /home/luoling8192/Git/worktree/airi/serverlize && pnpm --filter @proj-airi/server-sdk add @moeru/eventa`

- [ ] **Step 2: Create event definitions**

Create `packages/server-sdk/src/events/chat.ts`:

```ts
import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

export interface WireMessage {
  id: string
  chatId: string
  senderId: string | null
  role: 'system' | 'user' | 'assistant' | 'tool' | 'error'
  content: string
  seq: number
  createdAt: number
  updatedAt: number
}

export type MessageRole = WireMessage['role']

export interface SendMessagesRequest {
  chatId: string
  messages: { id: string, role: string, content: string }[]
}

export interface SendMessagesResponse {
  seq: number
}

export interface PullMessagesRequest {
  chatId: string
  afterSeq: number
  limit?: number
}

export interface PullMessagesResponse {
  messages: WireMessage[]
  seq: number
}

export interface NewMessagesPayload {
  chatId: string
  messages: WireMessage[]
  fromSeq: number
  toSeq: number
}

export const sendMessages = defineInvokeEventa<SendMessagesResponse, SendMessagesRequest>('chat:send-messages')
export const pullMessages = defineInvokeEventa<PullMessagesResponse, PullMessagesRequest>('chat:pull-messages')
export const newMessages = defineOutboundEventa<NewMessagesPayload>('chat:new-messages')
```

- [ ] **Step 3: Re-export from server-sdk index**

Add to `packages/server-sdk/src/index.ts`:

```ts
export * from './events/chat'
```

- [ ] **Step 4: Verify build**

Run: `cd /home/luoling8192/Git/worktree/airi/serverlize && pnpm --filter @proj-airi/server-sdk build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/server-sdk/
git commit -m "feat(server-sdk): add shared chat event definitions for eventa RPC"
```

---

## Chunk 2: eventa Hono WebSocket Adapter

### Task 3: Spike and implement the eventa Hono adapter

**Files:**
- Create: `apps/server/src/libs/eventa-hono-adapter.ts`
- Create: `apps/server/src/libs/__test__/eventa-hono-adapter.test.ts`

**Reference:** Study the H3 adapter at `node_modules/@moeru/eventa/dist/adapters/websocket/h3/index.mjs` for patterns. The adapter must:
1. Accept Hono `WSEvents` callbacks (onOpen, onMessage, onClose, onError)
2. Create an eventa `EventContext` per peer
3. Wire outbound events to `ws.send()` as JSON `WebsocketPayload`
4. Wire incoming messages to inbound event emissions
5. Clean up on close

- [ ] **Step 1: Install `@hono/node-ws` and `@moeru/eventa` in server**

Run: `cd /home/luoling8192/Git/worktree/airi/serverlize && pnpm --filter @proj-airi/server add @hono/node-ws @moeru/eventa`

- [ ] **Step 2: Write the adapter test**

Create `apps/server/src/libs/__test__/eventa-hono-adapter.test.ts`:

```ts
import type { WSContext } from 'hono/ws'

import { defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'

import { createPeerHooks } from '../eventa-hono-adapter'

function createMockWSContext(): WSContext & { sentMessages: string[] } {
  const sentMessages: string[] = []
  return {
    send: vi.fn((data: string) => sentMessages.push(data)),
    close: vi.fn(),
    readyState: 1,
    raw: {},
    url: null,
    protocol: null,
    sentMessages,
  } as any
}

describe('eventa Hono adapter', () => {
  it('creates peer context on open and cleans up on close', () => {
    let contextReceived = false
    const { hooks } = createPeerHooks({
      onContext: () => { contextReceived = true },
    })

    const ws = createMockWSContext()
    hooks.onOpen!({} as any, ws)
    expect(contextReceived).toBe(true)

    hooks.onClose!({} as any, ws)
  })

  it('routes inbound messages to eventa context', async () => {
    const echo = defineInvokeEventa<{ out: string }, { in: string }>('test:echo')
    let handler: ((req: { in: string }) => { out: string }) | undefined

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        defineInvokeHandler(ctx, echo, (req) => {
          return { out: req.in.toUpperCase() }
        })
      },
    })

    const ws = createMockWSContext()
    hooks.onOpen!({} as any, ws)

    // Simulate an inbound invoke message
    const payload = JSON.stringify({
      id: 'test-1',
      type: 'test:echo',
      payload: { in: 'hello' },
      timestamp: Date.now(),
    })

    // Hono's WSEvents.onMessage receives a MessageEvent-like object with a .data property
    const messageEvent = { data: payload } as any
    hooks.onMessage!({} as any, ws, messageEvent)

    // Give async handlers time to process
    await new Promise(r => setTimeout(r, 50))

    // The adapter should have sent a response back
    expect(ws.sentMessages.length).toBeGreaterThan(0)
    const response = JSON.parse(ws.sentMessages[0])
    expect(response.payload).toEqual({ out: 'HELLO' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run src/libs/__test__/eventa-hono-adapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**

Create `apps/server/src/libs/eventa-hono-adapter.ts`.

Follow the same pattern as the H3 adapter at `node_modules/@moeru/eventa/dist/adapters/websocket/h3/index.mjs`:
- Use `ctx.on(and(matchBy(e => e._flowDirection === 'outbound' || !e._flowDirection), matchBy('*')), handler)` to listen for outbound events, NOT by monkey-patching `ctx.emit`
- Use `defineInboundEventa(type)` + `ctx.emit(inboundEvent, payload)` for incoming messages
- Use `generateWebsocketPayload` / `parseWebsocketPayload` helpers (same as H3 adapter)

```ts
import type { EventContext } from '@moeru/eventa'
import type { WSContext, WSEvents } from 'hono/ws'

import { and, createContext, defineEventa, defineInboundEventa, matchBy } from '@moeru/eventa'

import { nanoid } from '../utils/id'

export interface WebsocketPayload<T = unknown> {
  id: string
  type: string
  payload: T
  timestamp: number
}

export const wsConnectedEvent = defineEventa<{ url: string | null }>()
export const wsDisconnectedEvent = defineEventa<{ url: string | null, code?: number, reason?: string }>()
export const wsErrorEvent = defineEventa<{ error: unknown }>()

function generateWebsocketPayload<T>(type: string, payload: T): WebsocketPayload<T> {
  return { id: nanoid(), type, payload, timestamp: Date.now() }
}

function parseWebsocketPayload(data: unknown): WebsocketPayload | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    if (parsed && typeof parsed === 'object' && 'type' in parsed && 'payload' in parsed) {
      return parsed as WebsocketPayload
    }
    return null
  }
  catch {
    return null
  }
}

export interface PeerHooksOptions {
  onContext: (ctx: EventContext) => void
}

export function createPeerHooks(options: PeerHooksOptions): { hooks: WSEvents, context: EventContext | null } {
  let context: EventContext | null = null
  let ws: WSContext | null = null

  const result = { hooks: {} as WSEvents, get context() { return context } }

  result.hooks = {
    onOpen(_evt, wsCtx) {
      ws = wsCtx
      const ctx = createContext()

      // Wire outbound events to WebSocket send — same pattern as H3 adapter.
      // Listen for outbound or non-directional events and forward them over the wire.
      ctx.on(
        and(
          matchBy((e: any) => e._flowDirection === 'outbound' || !e._flowDirection),
          matchBy('*'),
        ),
        (event: any) => {
          // Skip lifecycle events
          if (event === wsConnectedEvent || event === wsDisconnectedEvent || event === wsErrorEvent)
            return

          const tag = typeof event.id === 'string' ? event.id : event.type
          if (!tag)
            return

          try {
            const wirePayload = generateWebsocketPayload(tag, event.body)
            wsCtx.send(JSON.stringify(wirePayload))
          }
          catch {
            // swallow send errors on closed connections
          }
        },
      )

      context = ctx
      ctx.emit(wsConnectedEvent, { url: null })
      options.onContext(ctx)
    },

    onMessage(_evt, _wsCtx, message) {
      if (!context)
        return

      const data = message.data
      const parsed = parseWebsocketPayload(data)
      if (!parsed)
        return

      // Tag as inbound to prevent echo-back
      const inboundEvent = defineInboundEventa(parsed.type)
      context.emit(inboundEvent, parsed.payload, { raw: { message: parsed } } as any)
    },

    onClose(_evt, _wsCtx) {
      if (context) {
        context.emit(wsDisconnectedEvent, { url: null })
        // Use off with wildcard to clean up all listeners
        context.off(matchBy('*'))
      }
      context = null
      ws = null
    },

    onError(_evt, _wsCtx, error) {
      if (context) {
        context.emit(wsErrorEvent, { error })
      }
    },
  }

  return result
}
```

> **Note:** This is a spike implementation. The exact eventa API (`and`, `matchBy`, `EventaFlowDirection`) may differ between versions. If `and`/`matchBy` are not exported from the top-level `@moeru/eventa`, check sub-paths or the H3 adapter source for the correct imports. If the eventa listener-based approach doesn't work for invoke response routing, fall back to raw `@hono/node-ws` with a JSON-RPC-style protocol as described in the spec's Fallback section.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run src/libs/__test__/eventa-hono-adapter.test.ts`
Expected: PASS. If eventa internals don't match assumptions, iterate on the implementation.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/libs/eventa-hono-adapter.ts apps/server/src/libs/__test__/eventa-hono-adapter.test.ts
git commit -m "feat(server): add eventa Hono WebSocket adapter"
```

---

## Chunk 3: Chat Service Rewrite

### Task 4: Rewrite chat service — split into chat management + message sync

**Files:**
- Modify: `apps/server/src/services/chats.ts`
- Create: `apps/server/src/services/__test__/chats.test.ts`
- Modify: `apps/server/src/libs/otel.ts` (add WS metrics)

- [ ] **Step 1: Add WS metrics to otel**

In `apps/server/src/libs/otel.ts`, add to the `EngagementMetrics` interface and its initialization:

```ts
// Add to EngagementMetrics interface:
wsConnectionsActive: UpDownCounter
wsMessagesSent: Counter
wsMessagesReceived: Counter

// Add to the metrics initialization (where chatSync, chatMessages etc. are created):
wsConnectionsActive: meter.createUpDownCounter('ws.connections.active', { description: 'Active WebSocket connections' }),
wsMessagesSent: meter.createCounter('ws.messages.sent', { description: 'Messages sent via WebSocket' }),
wsMessagesReceived: meter.createCounter('ws.messages.received', { description: 'Messages received via WebSocket' }),
```

Also add `UpDownCounter` to the imports from `@opentelemetry/api` if not already present.

- [ ] **Step 2: Write tests for the new chat service methods**

Create `apps/server/src/services/__test__/chats.test.ts`. Since these tests require a DB, use the mock-db pattern from `apps/server/src/libs/mock-db.ts` if available, or write unit tests for pure logic:

```ts
import { describe, expect, it } from 'vitest'

// Test the pure helper functions
describe('chat service helpers', () => {
  describe('resolveSenderId', () => {
    it('returns userId for user role', () => {
      // Will be tested after implementing
    })

    it('returns characterId for non-user role when available', () => {
      // Will be tested after implementing
    })

    it('returns null for non-user role without characterId', () => {
      // Will be tested after implementing
    })
  })

  describe('clampLimit', () => {
    it('returns default 100 when no limit provided', () => {
      // Will be tested after implementing
    })

    it('clamps to max 500', () => {
      // Will be tested after implementing
    })
  })
})
```

- [ ] **Step 3: Rewrite the chat service**

Replace `apps/server/src/services/chats.ts` with two sets of methods:

**Chat management methods** (used by REST routes):
- `createChat(userId, payload)` — create chat + add creator as member
- `updateChat(userId, chatId, payload)` — update title (verify membership)
- `deleteChat(userId, chatId)` — soft-delete (verify membership)
- `getChat(userId, chatId)` — get chat details (verify membership)
- `listChats(userId)` — list user's chats
- `addMember(userId, chatId, member)` — add member (verify membership)
- `removeMember(userId, chatId, memberId)` — remove member (verify membership)

**Message sync methods** (used by WS handlers):
- `pushMessages(userId, chatId, messages)` — write messages with seq, return seq range
- `pullMessages(userId, chatId, afterSeq, limit)` — read messages after seq

**Shared helpers:**
- `verifyMembership(tx, chatId, userId)` — check user is member, chat not soft-deleted
- `resolveSenderId(role, userId, characterId?)` — return userId for user role, characterId or null otherwise
- `clampLimit(limit?)` — default 100, max 500

```ts
import type { Database } from '../libs/db'
import type { EngagementMetrics } from '../libs/otel'

import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

import { createForbiddenError, createNotFoundError } from '../utils/error'
import { nanoid } from '../utils/id'

import * as schema from '../schemas/chats'

type ChatType = 'private' | 'bot' | 'group' | 'channel'
type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'error'
type ChatMemberType = 'user' | 'character' | 'bot'

const DEFAULT_PULL_LIMIT = 100
const MAX_PULL_LIMIT = 500

export function clampLimit(limit?: number): number {
  if (!limit || limit <= 0)
    return DEFAULT_PULL_LIMIT
  return Math.min(limit, MAX_PULL_LIMIT)
}

export function resolveSenderId(role: MessageRole, userId: string, characterId?: string | null): string | null {
  if (role === 'user')
    return userId
  return characterId ?? null
}

export function createChatService(db: Database, metrics?: EngagementMetrics | null) {
  async function verifyMembership(tx: any, chatId: string, userId: string) {
    const chat = await tx.query.chats.findFirst({
      where: and(eq(schema.chats.id, chatId), isNull(schema.chats.deletedAt)),
    })
    if (!chat)
      throw createNotFoundError('Chat not found')

    const member = await tx.query.chatMembers.findFirst({
      where: and(
        eq(schema.chatMembers.chatId, chatId),
        eq(schema.chatMembers.memberType, 'user'),
        eq(schema.chatMembers.userId, userId),
      ),
    })
    if (!member)
      throw createForbiddenError()

    return chat
  }

  return {
    // --- Chat Management (REST) ---

    async createChat(userId: string, payload: {
      id?: string
      type?: ChatType
      title?: string
      members?: { type: ChatMemberType, userId?: string, characterId?: string }[]
    }) {
      const chatId = payload.id || nanoid()
      const now = new Date()

      await db.transaction(async (tx) => {
        await tx.insert(schema.chats).values({
          id: chatId,
          type: payload.type ?? 'group',
          title: payload.title ?? null,
          createdAt: now,
          updatedAt: now,
        })

        // Add creator as member
        await tx.insert(schema.chatMembers).values({
          chatId,
          memberType: 'user',
          userId,
          characterId: null,
        })

        // Add additional members
        const additionalMembers = (payload.members ?? []).filter(m => m.type !== 'user' || m.userId !== userId)
        if (additionalMembers.length > 0) {
          await tx.insert(schema.chatMembers).values(
            additionalMembers.map(m => ({
              chatId,
              memberType: m.type,
              userId: m.type === 'user' ? (m.userId ?? null) : null,
              characterId: m.type === 'character' ? (m.characterId ?? null) : null,
            })),
          )
        }
      })

      return { id: chatId }
    },

    async getChat(userId: string, chatId: string) {
      return db.transaction(async (tx) => {
        const chat = await verifyMembership(tx, chatId, userId)
        const members = await tx.query.chatMembers.findMany({
          where: eq(schema.chatMembers.chatId, chatId),
        })
        return { ...chat, members }
      })
    },

    async listChats(userId: string) {
      const memberRows = await db.query.chatMembers.findMany({
        where: and(
          eq(schema.chatMembers.memberType, 'user'),
          eq(schema.chatMembers.userId, userId),
        ),
      })
      const chatIds = memberRows.map(m => m.chatId)
      if (chatIds.length === 0)
        return []

      return db.query.chats.findMany({
        where: and(inArray(schema.chats.id, chatIds), isNull(schema.chats.deletedAt)),
      })
    },

    async updateChat(userId: string, chatId: string, payload: { title?: string }) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        await tx.update(schema.chats)
          .set({ title: payload.title, updatedAt: new Date() })
          .where(eq(schema.chats.id, chatId))
        return { id: chatId }
      })
    },

    async deleteChat(userId: string, chatId: string) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        await tx.update(schema.chats)
          .set({ deletedAt: new Date() })
          .where(eq(schema.chats.id, chatId))
        return { id: chatId }
      })
    },

    async addMember(userId: string, chatId: string, member: { type: ChatMemberType, userId?: string, characterId?: string }) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        await tx.insert(schema.chatMembers).values({
          chatId,
          memberType: member.type,
          userId: member.type === 'user' ? (member.userId ?? null) : null,
          characterId: member.type === 'character' ? (member.characterId ?? null) : null,
        })
        return { chatId }
      })
    },

    async removeMember(userId: string, chatId: string, memberId: string) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        await tx.delete(schema.chatMembers)
          .where(and(
            eq(schema.chatMembers.id, memberId),
            eq(schema.chatMembers.chatId, chatId),
          ))
        return { chatId }
      })
    },

    // --- Message Sync (WS) ---

    async pushMessages(userId: string, chatId: string, messages: { id: string, role: string, content: string }[], characterId?: string | null) {
      const result = await db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        // Lock the chat row to serialize concurrent seq assignments
        await tx.execute(sql`SELECT id FROM ${schema.chats} WHERE id = ${chatId} FOR UPDATE`)

        const now = new Date()
        const seqResult = await tx
          .select({ maxSeq: sql<number>`COALESCE(MAX(${schema.messages.seq}), 0)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, chatId))

        let nextSeq = (seqResult[0]?.maxSeq ?? 0) + 1
        const firstSeq = nextSeq
        const insertedSeqs: number[] = []

        for (const msg of messages) {
          // Check if message already exists (for upsert)
          const existing = await tx.query.messages.findFirst({
            where: eq(schema.messages.id, msg.id),
          })

          if (existing) {
            // Update content only, don't assign new seq
            await tx.update(schema.messages)
              .set({ content: msg.content, updatedAt: now })
              .where(eq(schema.messages.id, msg.id))
            insertedSeqs.push(existing.seq!)
          }
          else {
            // Insert with new seq
            await tx.insert(schema.messages).values({
              id: msg.id,
              chatId,
              senderId: resolveSenderId(msg.role as MessageRole, userId, characterId),
              role: msg.role,
              content: msg.content,
              mediaIds: [] as string[],
              stickerIds: [] as string[],
              seq: nextSeq,
              createdAt: now,
              updatedAt: now,
            })
            insertedSeqs.push(nextSeq)
            nextSeq++
          }
        }

        const lastSeq = nextSeq - 1
        return {
          lastSeq,
          fromSeq: Math.min(...insertedSeqs),
          toSeq: Math.max(...insertedSeqs),
          newCount: nextSeq - firstSeq,
        }
      })

      metrics?.chatSync.add(1)
      if (result.newCount > 0) {
        metrics?.chatMessages.add(result.newCount)
        metrics?.wsMessagesReceived.add(result.newCount)
      }

      return { seq: result.lastSeq, fromSeq: result.fromSeq, toSeq: result.toSeq }
    },

    async pullMessages(userId: string, chatId: string, afterSeq: number, limit?: number) {
      const clamped = clampLimit(limit)

      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        const msgs = await tx
          .select()
          .from(schema.messages)
          .where(and(
            eq(schema.messages.chatId, chatId),
            gt(schema.messages.seq, afterSeq),
            isNull(schema.messages.deletedAt),
          ))
          .orderBy(schema.messages.seq)
          .limit(clamped)

        const maxSeqResult = await tx
          .select({ maxSeq: sql<number>`COALESCE(MAX(${schema.messages.seq}), 0)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, chatId))

        const currentSeq = maxSeqResult[0]?.maxSeq ?? 0

        return {
          messages: msgs.map(m => ({
            id: m.id,
            chatId: m.chatId,
            senderId: m.senderId,
            role: m.role as MessageRole,
            content: m.content,
            seq: m.seq!,
            createdAt: m.createdAt.getTime(),
            updatedAt: m.updatedAt.getTime(),
          })),
          seq: currentSeq,
        }
      })
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
```

- [ ] **Step 4: Update tests with actual assertions**

Update `apps/server/src/services/__test__/chats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { clampLimit, resolveSenderId } from '../chats'

describe('resolveSenderId', () => {
  it('returns userId for user role', () => {
    expect(resolveSenderId('user', 'user-123', 'char-456')).toBe('user-123')
  })

  it('returns characterId for non-user role when available', () => {
    expect(resolveSenderId('assistant', 'user-123', 'char-456')).toBe('char-456')
  })

  it('returns null for non-user role without characterId', () => {
    expect(resolveSenderId('assistant', 'user-123')).toBeNull()
    expect(resolveSenderId('system', 'user-123', null)).toBeNull()
  })
})

describe('clampLimit', () => {
  it('returns default 100 when no limit', () => {
    expect(clampLimit()).toBe(100)
    expect(clampLimit(undefined)).toBe(100)
  })

  it('returns default 100 for zero or negative', () => {
    expect(clampLimit(0)).toBe(100)
    expect(clampLimit(-5)).toBe(100)
  })

  it('returns limit when within range', () => {
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(500)).toBe(500)
  })

  it('clamps to max 500', () => {
    expect(clampLimit(501)).toBe(500)
    expect(clampLimit(1000)).toBe(500)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd apps/server && pnpm vitest run src/services/__test__/chats.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/chats.ts apps/server/src/services/__test__/chats.test.ts apps/server/src/libs/otel.ts
git commit -m "feat(server): rewrite chat service with chat mgmt + message sync split"
```

---

## Chunk 4: REST Routes + Validation Schemas

### Task 5: Rewrite validation schemas for REST endpoints

**Files:**
- Modify: `apps/server/src/api/chats.schema.ts`

- [ ] **Step 1: Replace sync schema with REST schemas**

Rewrite `apps/server/src/api/chats.schema.ts`:

```ts
import { array, literal, maxLength, minLength, object, optional, pipe, string, union } from 'valibot'

const ChatTypeSchema = union([
  literal('private'),
  literal('bot'),
  literal('group'),
  literal('channel'),
])

const ChatMemberTypeSchema = union([
  literal('user'),
  literal('character'),
  literal('bot'),
])

// POST /api/chats
export const CreateChatSchema = object({
  id: optional(pipe(string(), minLength(1), maxLength(30))),
  type: optional(ChatTypeSchema),
  title: optional(string()),
  members: optional(array(object({
    type: ChatMemberTypeSchema,
    userId: optional(string()),
    characterId: optional(string()),
  }))),
})

// PATCH /api/chats/:id
export const UpdateChatSchema = object({
  title: optional(string()),
})

// POST /api/chats/:id/members
export const AddMemberSchema = object({
  type: ChatMemberTypeSchema,
  userId: optional(string()),
  characterId: optional(string()),
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/api/chats.schema.ts
git commit -m "feat(server): rewrite chat validation schemas for REST endpoints"
```

---

### Task 6: Rewrite chat routes as REST CRUD

**Files:**
- Modify: `apps/server/src/routes/chats.ts`

- [ ] **Step 1: Replace sync route with REST routes**

Rewrite `apps/server/src/routes/chats.ts`:

```ts
import type { ChatService } from '../services/chats'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { AddMemberSchema, CreateChatSchema, UpdateChatSchema } from '../api/chats.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError } from '../utils/error'

export function createChatRoutes(chatService: ChatService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    // POST /api/chats — Create chat
    .post('/', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(CreateChatSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const chat = await chatService.createChat(user.id, result.output)
      return c.json(chat, 201)
    })

    // GET /api/chats — List user's chats
    .get('/', async (c) => {
      const user = c.get('user')!
      const chats = await chatService.listChats(user.id)
      return c.json({ chats })
    })

    // GET /api/chats/:id — Get chat details
    .get('/:id', async (c) => {
      const user = c.get('user')!
      const chat = await chatService.getChat(user.id, c.req.param('id'))
      return c.json(chat)
    })

    // PATCH /api/chats/:id — Update chat
    .patch('/:id', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(UpdateChatSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const updated = await chatService.updateChat(user.id, c.req.param('id'), result.output)
      return c.json(updated)
    })

    // DELETE /api/chats/:id — Soft-delete chat
    .delete('/:id', async (c) => {
      const user = c.get('user')!
      const deleted = await chatService.deleteChat(user.id, c.req.param('id'))
      return c.json(deleted)
    })

    // POST /api/chats/:id/members — Add member
    .post('/:id/members', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(AddMemberSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const added = await chatService.addMember(user.id, c.req.param('id'), result.output)
      return c.json(added)
    })

    // DELETE /api/chats/:id/members/:memberId — Remove member
    .delete('/:id/members/:memberId', async (c) => {
      const user = c.get('user')!
      const removed = await chatService.removeMember(user.id, c.req.param('id'), c.req.param('memberId'))
      return c.json(removed)
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/chats.ts
git commit -m "feat(server): rewrite chat routes as REST CRUD + member management"
```

---

## Chunk 5: WebSocket Route + Multi-Device Push + App Integration

### Task 7: Create WebSocket route with eventa RPC handlers

**Files:**
- Create: `apps/server/src/routes/chat-ws.ts`

- [ ] **Step 1: Create the WS route**

Create `apps/server/src/routes/chat-ws.ts`:

```ts
import type { EventContext } from '@moeru/eventa'

import type { EngagementMetrics } from '../libs/otel'
import type { ChatService } from '../services/chats'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk'

import { createPeerHooks, wsConnectedEvent, wsDisconnectedEvent } from '../libs/eventa-hono-adapter'

const log = useLogg('chat-ws')

// Active connections per user
const userConnections = new Map<string, Set<EventContext>>()

function addConnection(userId: string, ctx: EventContext) {
  let conns = userConnections.get(userId)
  if (!conns) {
    conns = new Set()
    userConnections.set(userId, conns)
  }
  conns.add(ctx)
}

function removeConnection(userId: string, ctx: EventContext) {
  const conns = userConnections.get(userId)
  if (conns) {
    conns.delete(ctx)
    if (conns.size === 0)
      userConnections.delete(userId)
  }
}

function broadcastToOtherDevices(userId: string, senderCtx: EventContext, event: any, payload: any) {
  const conns = userConnections.get(userId)
  if (!conns)
    return
  for (const ctx of conns) {
    if (ctx !== senderCtx) {
      ctx.emit(event, payload)
    }
  }
}

export function createChatWsHandlers(chatService: ChatService, metrics?: EngagementMetrics | null) {
  return function setupPeer(userId: string) {
    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        addConnection(userId, ctx)
        log.withFields({ userId }).log('WS connected')
        metrics?.wsConnectionsActive.add(1)

        ctx.on(wsDisconnectedEvent, () => {
          removeConnection(userId, ctx)
          log.withFields({ userId }).log('WS disconnected')
          metrics?.wsConnectionsActive.add(-1)
        })

        // RPC: send messages
        defineInvokeHandler(ctx, sendMessages, async (req) => {
          log.withFields({ userId, chatId: req.chatId, count: req.messages.length }).log('sendMessages')

          const result = await chatService.pushMessages(userId, req.chatId, req.messages)

          // Broadcast to other devices
          const wireMessages = await chatService.pullMessages(userId, req.chatId, result.fromSeq - 1, result.toSeq - result.fromSeq + 1)
          broadcastToOtherDevices(userId, ctx, newMessages, {
            chatId: req.chatId,
            messages: wireMessages.messages,
            fromSeq: result.fromSeq,
            toSeq: result.toSeq,
          })

          metrics?.wsMessagesSent.add(wireMessages.messages.length)

          return { seq: result.seq }
        })

        // RPC: pull messages
        defineInvokeHandler(ctx, pullMessages, async (req) => {
          log.withFields({ userId, chatId: req.chatId, afterSeq: req.afterSeq }).log('pullMessages')

          return chatService.pullMessages(userId, req.chatId, req.afterSeq, req.limit)
        })
      },
    })

    return hooks
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/chat-ws.ts
git commit -m "feat(server): add WS chat route with eventa RPC handlers and multi-device push"
```

---

### Task 8: Integrate WS into the app

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/package.json` (already has `@hono/node-ws` from Task 3)

- [ ] **Step 1: Add WS setup to app.ts**

In `apps/server/src/app.ts`, add the following changes:

Import `@hono/node-ws`:

```ts
import { createNodeWebSocket } from '@hono/node-ws'
```

Import the WS route creator:

```ts
import { createChatWsHandlers } from './routes/chat-ws'
```

After creating the Hono app, set up WebSocket:

```ts
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
```

After the chat service is created, set up the WS route. Mount it **before** the body limit middleware:

```ts
// WS auth + upgrade
const chatWsSetup = createChatWsHandlers(chatService, metrics)

app.get('/ws/chat', upgradeWebSocket(async (c) => {
  // Auth via query param
  const token = c.req.query('token')
  if (!token) {
    throw createUnauthorizedError('Missing token')
  }

  // Validate token with better-auth session
  // (Use the auth session verification from better-auth)
  const session = await auth.api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }) })
  if (!session?.user) {
    throw createUnauthorizedError('Invalid token')
  }

  return chatWsSetup(session.user.id)
}))
```

After `serve()`, inject WebSocket:

```ts
injectWebSocket(server)
```

> **Important implementation notes:**
> 1. **Auth verification:** better-auth typically uses cookie-based sessions, not Bearer tokens. Check `apps/server/src/libs/auth.ts` for how sessions are validated. You may need to use `auth.api.getSession({ headers: c.req.raw.headers })` with the session cookie, or implement a short-lived ticket exchange (REST endpoint returns a one-time ticket, WS passes it as query param).
> 2. **bodyLimit middleware:** The current `app.ts` applies `bodyLimit({ maxSize: 1MB })` to all routes via `.use('*', ...)`. The WS upgrade route (`/ws/chat`) must be mounted **before** the bodyLimit middleware in the Hono chain, otherwise the middleware may interfere with the upgrade handshake. Restructure the middleware order in `buildApp()` accordingly.

- [ ] **Step 2: Verify the app compiles**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No type errors. Fix any type issues.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "feat(server): integrate WS chat endpoint into Hono app"
```

---

## Chunk 6: Migration + Cleanup

### Task 9: Create database migration for existing data

**Files:**
- This uses `drizzle-kit` to generate and may require a custom SQL migration

- [ ] **Step 1: Generate Drizzle migration**

Run: `cd apps/server && pnpm db:generate`

This should generate a migration for:
- `seq` column added to `messages` (nullable)
- `senderId` made nullable
- Unique constraint on `(chat_id, seq)`

- [ ] **Step 2: Create a custom SQL migration for backfill**

If Drizzle doesn't generate backfill logic, create a custom migration SQL file in the migrations directory:

```sql
-- Backfill seq values using row number
UPDATE messages m
SET seq = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at) as rn
  FROM messages
) sub
WHERE m.id = sub.id;

-- Clean up senderId for non-user roles
UPDATE messages
SET sender_id = NULL
WHERE sender_id IN ('assistant', 'system', 'tool', 'error');

-- Make seq NOT NULL after backfill
ALTER TABLE messages ALTER COLUMN seq SET NOT NULL;
```

- [ ] **Step 3: Update Drizzle schema to mark seq as NOT NULL**

After the migration backfills seq, update `apps/server/src/schemas/chats.ts` to reflect the final state:

```ts
seq: integer('seq').notNull(),
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/schemas/chats.ts drizzle/
git commit -m "feat(server): add database migration for seq column and senderId cleanup"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run all tests**

Run: `cd apps/server && pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 2: Verify app starts**

Run: `cd apps/server && pnpm dev`
Expected: Server starts without errors, WS endpoint accessible.

- [ ] **Step 3: Final commit with any remaining fixes**

Stage only the specific files that were modified:
```bash
git add apps/server/ packages/server-sdk/
git commit -m "fix(server): final adjustments for chat sync redesign"
```
