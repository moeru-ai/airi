/**
 * Transcript Store - append-only truth source for LLM conversation messages.
 *
 * Persists to `transcript.jsonl` under the session root. Never mutates
 * or deletes existing entries. Prompt pruning is handled by the projection
 * layer, not the store.
 *
 * This store is completely independent from `audit.jsonl` (operational trace).
 */

import type { TranscriptEntry, TranscriptToolCall } from './types'

import { createReadStream } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'

export class TranscriptStore {
  private entries: TranscriptEntry[] = []
  private nextId = 0
  private initialized = false
  private initPromise: Promise<void> | undefined
  private appendQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    if (this.initialized)
      return

    this.initPromise ??= this.initCommitted().finally(() => {
      this.initPromise = undefined
    })

    await this.initPromise
  }

  private async initCommitted(): Promise<void> {
    if (this.initialized)
      return

    await mkdir(dirname(this.filePath), { recursive: true })

    // Attempt to load existing transcript from disk without loading the full
    // JSONL file into memory.
    try {
      const stream = createReadStream(this.filePath, { encoding: 'utf-8' })
      const lines = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const line of lines) {
        if (line.trim().length === 0)
          continue
        try {
          const entry = JSON.parse(line) as TranscriptEntry
          this.entries.push(entry)
          if (entry.id >= this.nextId) {
            this.nextId = entry.id + 1
          }
        }
        catch {
          // Skip malformed lines - defensive against partial writes.
        }
      }
    }
    catch (error) {
      if (getNodeErrorCode(error) !== 'ENOENT') {
        throw error
      }
      // File does not exist yet - valid for a fresh session.
    }

    this.initialized = true
  }

  /**
   * Append a user message to the transcript.
   */
  async appendUser(content: string | unknown[]): Promise<TranscriptEntry> {
    return this.append({ role: 'user', content })
  }

  /**
   * Append an assistant message (text-only, no tool calls).
   */
  async appendAssistantText(content: string | unknown[]): Promise<TranscriptEntry> {
    return this.append({ role: 'assistant', content })
  }

  /**
   * Append an assistant message that contains tool calls.
   */
  async appendAssistantToolCalls(
    toolCalls: TranscriptToolCall[],
    content?: string | unknown[],
  ): Promise<TranscriptEntry> {
    return this.append({ role: 'assistant', content, toolCalls })
  }

  /**
   * Append a tool result message.
   */
  async appendToolResult(toolCallId: string, content: string | unknown[]): Promise<TranscriptEntry> {
    return this.append({ role: 'tool', content, toolCallId })
  }

  /**
   * Append a system message.
   */
  async appendSystem(content: string | unknown[]): Promise<TranscriptEntry> {
    return this.append({ role: 'system', content })
  }

  /**
   * Append a raw xsai message faithfully, preserving its original shape.
   * Use this for ingesting generateText() results without coercion.
   */
  async appendRawMessage(msg: {
    role: string
    content?: unknown
    tool_calls?: Array<{ id: string, type: string, function: { name: string, arguments: string } }>
    tool_call_id?: string
  }): Promise<TranscriptEntry | null> {
    if (msg.role === 'assistant') {
      const toolCalls = msg.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        const tcs: TranscriptToolCall[] = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }))
        const content = normalizeContent(msg.content)
        return this.appendAssistantToolCalls(tcs, content)
      }
      else {
        const content = normalizeContent(msg.content)
        return this.appendAssistantText(content ?? '')
      }
    }
    else if (msg.role === 'tool') {
      const content = normalizeContent(msg.content)
      const toolCallId = typeof msg.tool_call_id === 'string'
        ? msg.tool_call_id.trim()
        : ''
      if (!toolCallId)
        return null
      return this.appendToolResult(toolCallId, content ?? '')
    }
    else if (msg.role === 'user') {
      const content = normalizeContent(msg.content)
      return this.appendUser(content ?? '')
    }
    else if (msg.role === 'system') {
      const content = normalizeContent(msg.content)
      return this.appendSystem(content ?? '')
    }
    // Unknown role - skip silently.
    return null
  }

  /**
   * Get all entries (full transcript). The store is the truth source;
   * the projection layer decides what subset to project into the prompt.
   */
  getAll(): readonly TranscriptEntry[] {
    return this.entries
  }

  /**
   * Get entries by id range (inclusive). Useful for targeted projection.
   */
  getRange(fromId: number, toId: number): TranscriptEntry[] {
    return this.entries.filter(e => e.id >= fromId && e.id <= toId)
  }

  /**
   * Get the total number of entries.
   */
  get length(): number {
    return this.entries.length
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async append(
    partial: Omit<TranscriptEntry, 'id' | 'at'>,
  ): Promise<TranscriptEntry> {
    const pending = this.appendQueue.then(
      async () => {
        await this.init()
        return this.appendCommitted(partial)
      },
      async () => {
        await this.init()
        return this.appendCommitted(partial)
      },
    )
    this.appendQueue = pending.catch(() => undefined)
    return pending
  }

  private async appendCommitted(
    partial: Omit<TranscriptEntry, 'id' | 'at'>,
  ): Promise<TranscriptEntry> {
    const entry: TranscriptEntry = {
      ...partial,
      id: this.nextId,
      at: new Date().toISOString(),
    }

    // Persist - append-only JSONL.
    await this.persist(entry)

    this.entries.push(entry)
    this.nextId++

    return entry
  }

  /** Override in subclasses to skip or redirect I/O. */
  protected async persist(entry: TranscriptEntry): Promise<void> {
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf-8')
  }
}

// ---------------------------------------------------------------------------
// In-memory variant for testing (no disk I/O)
// ---------------------------------------------------------------------------

/**
 * A TranscriptStore that operates purely in memory.
 * Drop-in replacement for tests and soak runner mocks.
 */
export class InMemoryTranscriptStore extends TranscriptStore {
  constructor() {
    // Use a dummy path; init() and persist() are overridden to skip disk I/O.
    super('/dev/null/transcript.jsonl')
  }

  override async init(): Promise<void> {
    // No-op: skip disk I/O entirely
  }

  protected override async persist(_entry: TranscriptEntry): Promise<void> {
    // No-op: skip disk persistence
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize unknown content from xsai messages into the transcript content type.
 * Preserves strings and arrays as-is; converts other types to string.
 */
function normalizeContent(content: unknown): string | unknown[] | undefined {
  if (content === undefined || content === null)
    return undefined
  if (typeof content === 'string')
    return content
  if (Array.isArray(content))
    return content
  // Fallback: coerce to string
  return String(content)
}

function getNodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}
