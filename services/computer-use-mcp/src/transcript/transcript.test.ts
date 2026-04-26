import type { TranscriptEntry } from './types'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseTranscriptBlocks } from './block-parser'
import { compactBlock } from './compactor'
import { projectTranscript } from './projector'
import { InMemoryTranscriptStore, TranscriptStore } from './store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0
function resetIds() {
  idCounter = 0
}

function entry(role: TranscriptEntry['role'], content: string | unknown[], extra?: Partial<TranscriptEntry>): TranscriptEntry {
  const id = idCounter++
  return { id, at: new Date().toISOString(), role, content, ...extra }
}

function userEntry(content: string) {
  return entry('user', content)
}

function assistantText(content: string) {
  return entry('assistant', content)
}

function assistantWithTools(toolIds: string[], content = '') {
  return entry('assistant', content, {
    toolCalls: toolIds.map(id => ({
      id,
      type: 'function' as const,
      function: { name: `tool_${id}`, arguments: '{}' },
    })),
  })
}

function toolResult(toolCallId: string, content: string | unknown[] = `result for ${toolCallId}`) {
  return entry('tool', content, { toolCallId })
}

function systemEntry(content: string) {
  return entry('system', content)
}

// ---------------------------------------------------------------------------
// TranscriptStore
// ---------------------------------------------------------------------------

describe('transcriptStore', () => {
  it('append and readback preserve order', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    await store.appendUser('task')
    await store.appendAssistantText('thinking')
    await store.appendAssistantToolCalls(
      [{ id: 'tc1', type: 'function', function: { name: 'read', arguments: '{}' } }],
      '',
    )
    await store.appendToolResult('tc1', 'file content')

    const all = store.getAll()
    expect(all).toHaveLength(4)
    expect(all[0].role).toBe('user')
    expect(all[1].role).toBe('assistant')
    expect(all[2].role).toBe('assistant')
    expect(all[2].toolCalls).toHaveLength(1)
    expect(all[3].role).toBe('tool')
    expect(all[3].toolCallId).toBe('tc1')

    // IDs are monotonically increasing
    for (let i = 1; i < all.length; i++) {
      expect(all[i].id).toBeGreaterThan(all[i - 1].id)
    }
  })

  it('length reflects total entries', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    expect(store.length).toBe(0)
    await store.appendUser('a')
    await store.appendUser('b')
    expect(store.length).toBe(2)
  })

  it('serializes concurrent appends before assigning entry ids', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    const entries = await Promise.all([
      store.appendUser('task 1'),
      store.appendUser('task 2'),
      store.appendUser('task 3'),
    ])

    expect(entries.map(entry => entry.id)).toEqual([0, 1, 2])
    expect(store.getAll().map(entry => entry.id)).toEqual([0, 1, 2])
  })

  it('reloads file-backed JSONL transcript entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'airi-transcript-'))
    try {
      const filePath = join(dir, 'transcript.jsonl')
      const store = new TranscriptStore(filePath)
      await store.init()
      await store.appendUser('persisted task')

      const reloaded = new TranscriptStore(filePath)
      await reloaded.init()
      expect(reloaded.getAll()).toHaveLength(1)
      expect(reloaded.getAll()[0].content).toBe('persisted task')

      await reloaded.appendAssistantText('next')
      expect(reloaded.getAll()[1].id).toBe(1)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('awaits initialization before assigning append ids', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'airi-transcript-'))
    try {
      const filePath = join(dir, 'transcript.jsonl')
      const store = new TranscriptStore(filePath)
      await store.init()
      await store.appendUser('persisted task')

      const reloaded = new TranscriptStore(filePath)
      const appended = await reloaded.appendAssistantText('next')

      expect(appended.id).toBe(1)
      expect(reloaded.getAll().map(entry => entry.id)).toEqual([0, 1])
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('serializes concurrent init calls without replaying JSONL twice', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'airi-transcript-'))
    try {
      const filePath = join(dir, 'transcript.jsonl')
      const store = new TranscriptStore(filePath)
      await store.init()
      await store.appendUser('persisted task')

      const reloaded = new TranscriptStore(filePath)
      await Promise.all([
        reloaded.init(),
        reloaded.init(),
        reloaded.init(),
      ])

      expect(reloaded.getAll()).toHaveLength(1)
      expect(reloaded.getAll()[0].id).toBe(0)

      const next = await reloaded.appendAssistantText('next')
      expect(next.id).toBe(1)
      expect(reloaded.getAll()).toHaveLength(2)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not commit in-memory entries when persistence fails', async () => {
    class FlakyTranscriptStore extends TranscriptStore {
      private failNextPersist = true

      protected override async persist(entry: TranscriptEntry): Promise<void> {
        if (this.failNextPersist) {
          this.failNextPersist = false
          throw new Error('disk full')
        }
        await super.persist(entry)
      }
    }

    const dir = await mkdtemp(join(tmpdir(), 'airi-transcript-'))
    try {
      const filePath = join(dir, 'transcript.jsonl')
      const store = new FlakyTranscriptStore(filePath)
      await store.init()

      await expect(store.appendUser('not committed')).rejects.toThrow('disk full')
      expect(store.length).toBe(0)

      const committed = await store.appendUser('committed')
      expect(committed.id).toBe(0)
      expect(store.getAll()).toHaveLength(1)
      expect(store.getAll()[0].content).toBe('committed')
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('non-string content survives round-trip without forced stringification', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    const structuredContent = [
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'data:...' } },
    ]
    await store.appendUser(structuredContent)

    const all = store.getAll()
    expect(all).toHaveLength(1)
    // Content should remain as an array, not stringified
    expect(Array.isArray(all[0].content)).toBe(true)
    expect(all[0].content).toEqual(structuredContent)
  })

  it('appendRawMessage faithfully ingests xsai messages', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    // Assistant with tool calls
    await store.appendRawMessage({
      role: 'assistant',
      content: 'let me check',
      tool_calls: [{
        id: 'tc1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path": "foo.ts"}' },
      }],
    })

    // Tool result
    await store.appendRawMessage({
      role: 'tool',
      content: 'file contents here',
      tool_call_id: 'tc1',
    })

    // Plain assistant text
    await store.appendRawMessage({
      role: 'assistant',
      content: 'I see the issue',
    })

    const all = store.getAll()
    expect(all).toHaveLength(3)
    expect(all[0].toolCalls).toHaveLength(1)
    expect(all[0].toolCalls![0].function.name).toBe('read_file')
    expect(all[1].role).toBe('tool')
    expect(all[1].toolCallId).toBe('tc1')
    expect(all[2].content).toBe('I see the issue')
  })

  it('appendRawMessage skips tool messages without a valid tool_call_id', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    const result = await store.appendRawMessage({
      role: 'tool',
      content: 'orphan result',
    })

    expect(result).toBeNull()
    expect(store.length).toBe(0)
  })

  it('appendRawMessage skips unknown roles', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    const result = await store.appendRawMessage({ role: 'weird_role', content: 'hmm' })
    expect(result).toBeNull()
    expect(store.length).toBe(0)
  })

  it('delta append: a second step does not duplicate earlier entries', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    // Step 1: user + assistant + tool
    await store.appendUser('initial task')
    await store.appendRawMessage({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    })
    await store.appendRawMessage({ role: 'tool', content: 'result1', tool_call_id: 'tc1' })

    expect(store.length).toBe(3)

    // Step 2: simulate delta-only append (only new messages from this step)
    await store.appendRawMessage({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc2', type: 'function', function: { name: 'write', arguments: '{}' } }],
    })
    await store.appendRawMessage({ role: 'tool', content: 'result2', tool_call_id: 'tc2' })

    // Total should be 5 (3 from step 1 + 2 from step 2), NOT 8 (if we re-appended everything)
    expect(store.length).toBe(5)

    // IDs should be strictly monotonic
    const all = store.getAll()
    for (let i = 1; i < all.length; i++) {
      expect(all[i].id).toBe(all[i - 1].id + 1)
    }
  })
})

// ---------------------------------------------------------------------------
// Block Parser
// ---------------------------------------------------------------------------

describe('parseTranscriptBlocks', () => {
  it('groups assistant + tool_calls + tool results into a ToolInteractionBlock', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1', 'tc2']),
      toolResult('tc1'),
      toolResult('tc2'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks).toHaveLength(2) // user + tool_interaction
    expect(blocks[0].kind).toBe('user')
    expect(blocks[1].kind).toBe('tool_interaction')

    if (blocks[1].kind === 'tool_interaction') {
      expect(blocks[1].toolResults).toHaveLength(2)
      expect(blocks[1].assistant.toolCalls).toHaveLength(2)
    }
  })

  it('plain assistant text becomes a TextBlock', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantText('thinking out loud'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks).toHaveLength(2)
    expect(blocks[1].kind).toBe('text')
  })

  it('orphan tool message becomes defensive TextBlock', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      toolResult('orphan_id', 'stray result'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks).toHaveLength(2)
    expect(blocks[1].kind).toBe('text')
  })

  it('handles interleaved tool interactions and text blocks', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantText('step 1 thought'),
      assistantWithTools(['tc1']),
      toolResult('tc1'),
      assistantText('step 2 thought'),
      assistantWithTools(['tc2', 'tc3']),
      toolResult('tc2'),
      toolResult('tc3'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks).toHaveLength(5)
    expect(blocks.map(b => b.kind)).toEqual([
      'user',
      'text',
      'tool_interaction',
      'text',
      'tool_interaction',
    ])
  })

  it('system messages become SystemBlocks', () => {
    resetIds()
    const entries = [
      systemEntry('you are a helper'),
      userEntry('task'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks[0].kind).toBe('system')
    expect(blocks[1].kind).toBe('user')
  })

  it('multiple tool-call assistant turns remain indivisible blocks', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1', 'tc2', 'tc3']),
      toolResult('tc1'),
      toolResult('tc2'),
      toolResult('tc3'),
    ]

    const blocks = parseTranscriptBlocks(entries)
    expect(blocks).toHaveLength(2) // user + 1 tool_interaction
    if (blocks[1].kind === 'tool_interaction') {
      expect(blocks[1].toolResults).toHaveLength(3)
      // All tool results belong to the same block
      expect(blocks[1].entryIdRange[0]).toBe(1) // assistant id
      expect(blocks[1].entryIdRange[1]).toBe(4) // last tool result id
    }
  })
})

// ---------------------------------------------------------------------------
// Compactor
// ---------------------------------------------------------------------------

describe('compactBlock', () => {
  it('compacts a tool interaction block with tool names and results', () => {
    resetIds()
    const block = parseTranscriptBlocks([
      assistantWithTools(['tc1']),
      toolResult('tc1', 'success data here'),
    ])[0]

    expect(block.kind).toBe('tool_interaction')
    const compacted = compactBlock(block)
    expect(compacted.kind).toBe('compacted')
    expect(compacted.originalKind).toBe('tool_interaction')
    expect(compacted.summary).toContain('tool_tc1')
    expect(compacted.summary).toContain('success data here')
  })

  it('does not infer tool result status from natural-language content', () => {
    resetIds()
    const block = parseTranscriptBlocks([
      assistantWithTools(['tc1']),
      toolResult('tc1', 'Error: file not found'),
    ])[0]

    const compacted = compactBlock(block)
    expect(compacted.summary).toContain('Error: file not found')
    expect(compacted.summary).not.toContain('FAILED')
  })

  it('compacts text blocks with truncated content', () => {
    resetIds()
    const longText = 'A'.repeat(200)
    const block = parseTranscriptBlocks([assistantText(longText)])[0]

    const compacted = compactBlock(block)
    expect(compacted.kind).toBe('compacted')
    expect(compacted.originalKind).toBe('text')
    expect(compacted.summary.length).toBeLessThan(200)
    expect(compacted.summary).toContain('...')
  })

  it('compacted block entryIdRange matches original', () => {
    resetIds()
    const block = parseTranscriptBlocks([
      assistantWithTools(['tc1', 'tc2']),
      toolResult('tc1'),
      toolResult('tc2'),
    ])[0]

    const compacted = compactBlock(block)
    expect(compacted.entryIdRange).toEqual(block.entryIdRange)
  })

  it('handles structured content arrays in compaction', () => {
    resetIds()
    const block = parseTranscriptBlocks([
      entry('assistant', [
        { type: 'text', text: 'structured response here' },
      ]),
    ])[0]

    const compacted = compactBlock(block)
    expect(compacted.summary).toContain('structured response here')
  })
})

// ---------------------------------------------------------------------------
// Transcript Projector (end-to-end)
// ---------------------------------------------------------------------------

describe('projectTranscript', () => {
  const baseOpts = {
    systemPromptBase: 'You are a coding assistant.',
  }

  it('pins the first user message permanently', () => {
    resetIds()
    const entries = [
      userEntry('initial task'),
      ...Array.from({ length: 10 }).flatMap((_, i) => [
        assistantWithTools([`tc${i}`]),
        toolResult(`tc${i}`),
      ]),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxFullTextBlocks: 1,
      maxCompactedBlocks: 2,
    })

    // First message must always be the pinned user task
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].content).toBe('initial task')
  })

  it('keeps recent tool blocks in full', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1']),
      toolResult('tc1', 'result 1'),
      assistantWithTools(['tc2']),
      toolResult('tc2', 'result 2'),
      assistantWithTools(['tc3']),
      toolResult('tc3', 'result 3'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxCompactedBlocks: 0,
    })

    // tc1 should be dropped, tc2 and tc3 kept in full
    const toolCallIds = result.messages
      .filter(m => m.role === 'tool')
      .map(m => m.tool_call_id)

    expect(toolCallIds).toContain('tc2')
    expect(toolCallIds).toContain('tc3')
  })

  it('no orphan tool messages after projection', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      ...Array.from({ length: 8 }).flatMap((_, i) => [
        assistantWithTools([`tc${i}`]),
        toolResult(`tc${i}`),
      ]),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 3,
      maxCompactedBlocks: 2,
    })

    // Collect all tool_call ids declared in assistant messages
    const declaredIds = new Set<string>()
    for (const m of result.messages) {
      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) declaredIds.add(tc.id)
      }
    }

    // Every tool message must reference a declared id
    for (const m of result.messages) {
      if (m.role === 'tool') {
        expect(declaredIds.has(m.tool_call_id!)).toBe(true)
      }
    }
  })

  it('compacted summaries are quoted assistant history, not system instructions', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1']),
      toolResult('tc1', 'old result'),
      assistantWithTools(['tc2']),
      toolResult('tc2', 'recent result'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 1,
      maxCompactedBlocks: 1,
    })

    expect(result.system).not.toContain('Compacted Transcript Summary')
    expect(result.system).not.toContain('[Compacted tool interaction]')
    expect(result.system).not.toContain('old result')

    const compactedMessages = result.messages.filter(m =>
      m.role === 'assistant'
      && !m.tool_calls
      && typeof m.content === 'string'
      && m.content.includes('Compacted transcript history follows as quoted JSON data.'),
    )
    expect(compactedMessages).toHaveLength(1)
    expect(compactedMessages[0].content).toContain('"summary":"[Compacted tool interaction]')
    expect(compactedMessages[0].content).toContain('old result')
  })

  it('projected messages never contain synthetic fake-user compaction records', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      ...Array.from({ length: 10 }).flatMap((_, i) => [
        assistantWithTools([`tc${i}`]),
        toolResult(`tc${i}`),
      ]),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxCompactedBlocks: 4,
    })

    // No message should be a synthetic compaction entry
    for (const m of result.messages) {
      if (m.role === 'user') {
        // User messages must be real user messages, not compacted summaries
        const content = typeof m.content === 'string' ? m.content : ''
        expect(content).not.toContain('[Compacted')
      }
    }
  })

  it('returns correct metadata including projectedMessageCount', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1']),
      toolResult('tc1'),
      assistantWithTools(['tc2']),
      toolResult('tc2'),
      assistantWithTools(['tc3']),
      toolResult('tc3'),
      assistantWithTools(['tc4']),
      toolResult('tc4'),
      assistantWithTools(['tc5']),
      toolResult('tc5'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxCompactedBlocks: 2,
    })

    expect(result.metadata.totalTranscriptEntries).toBe(11)
    expect(result.metadata.totalBlocks).toBe(6) // 1 user + 5 tool_interaction
    expect(result.metadata.keptFullBlocks).toBeGreaterThanOrEqual(3) // pinned user + 2 latest tool
    expect(result.metadata.compactedBlocks).toBeLessThanOrEqual(2)
    expect(result.metadata.projectedMessageCount).toBe(result.messages.length)
  })

  it('empty transcript produces empty messages but valid system header', () => {
    const result = projectTranscript([], baseOpts)
    expect(result.messages).toHaveLength(0)
    expect(result.system).toContain('coding assistant')
    expect(result.metadata.totalBlocks).toBe(0)
    expect(result.metadata.projectedMessageCount).toBe(0)
  })

  it('text blocks and tool blocks have independent limits', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantText('thought 1'),
      assistantText('thought 2'),
      assistantText('thought 3'),
      assistantWithTools(['tc1']),
      toolResult('tc1'),
      assistantWithTools(['tc2']),
      toolResult('tc2'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 5, // keep all tool blocks
      maxFullTextBlocks: 1, // only keep latest text block
      maxCompactedBlocks: 0, // no compaction
    })

    // All tool blocks should be present
    const toolMsgs = result.messages.filter(m => m.role === 'tool')
    expect(toolMsgs).toHaveLength(2)

    // Only the latest text block should be present in messages
    const assistantTexts = result.messages.filter(m =>
      m.role === 'assistant' && !m.tool_calls,
    )
    expect(assistantTexts).toHaveLength(1)
    expect(assistantTexts[0].content).toBe('thought 3')
  })

  it('respects zero full-block limits without replaying recent blocks', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantText('thought 1'),
      assistantWithTools(['tc1']),
      toolResult('tc1', 'tool result'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0,
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 10,
    })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[1].role).toBe('assistant')
    expect(result.messages.some(m => m.role === 'tool')).toBe(false)
    expect(result.metadata.compactedBlocks).toBe(2)
    expect(result.system).not.toContain('Compacted assistant text')
    expect(result.system).not.toContain('Compacted tool interaction')
    expect(result.messages[1].content).toContain('Compacted assistant text')
    expect(result.messages[1].content).toContain('Compacted tool interaction')
  })

  it('compacts older non-pinned user and system blocks', () => {
    resetIds()
    const entries = [
      systemEntry('early system'),
      userEntry('initial task'),
      assistantText('old assistant thought'),
      userEntry('follow-up 1'),
      systemEntry('runtime system update'),
      userEntry('follow-up 2'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0,
      maxFullTextBlocks: 1,
      maxCompactedBlocks: 10,
    })

    expect(result.messages.filter(m => m.role === 'user').map(m => m.content)).toEqual([
      'initial task',
      'follow-up 2',
    ])
    expect(result.metadata.compactedBlocks).toBe(4)
    expect(result.metadata.droppedBlocks).toBe(0)
    expect(result.system).not.toContain('Compacted system message')
    const compactedMessage = result.messages.find(m =>
      m.role === 'assistant'
      && !m.tool_calls
      && typeof m.content === 'string'
      && m.content.includes('Compacted transcript history follows as quoted JSON data.'),
    )
    expect(compactedMessage?.content).toContain('Compacted system message')
    expect(compactedMessage?.content).toContain('Compacted user message')
    expect(compactedMessage?.content).toContain('Compacted assistant text')
  })

  it('projection metadata changes as context grows', () => {
    resetIds()

    // Small context: everything fits
    const small = [
      userEntry('task'),
      assistantWithTools(['tc1']),
      toolResult('tc1'),
    ]

    const r1 = projectTranscript(small, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxCompactedBlocks: 2,
    })
    expect(r1.metadata.compactedBlocks).toBe(0)
    expect(r1.metadata.droppedBlocks).toBe(0)

    // Larger context: compaction kicks in
    resetIds()
    const large = [
      userEntry('task'),
      ...Array.from({ length: 6 }).flatMap((_, i) => [
        assistantWithTools([`tc${i}`]),
        toolResult(`tc${i}`),
      ]),
    ]

    const r2 = projectTranscript(large, {
      ...baseOpts,
      maxFullToolBlocks: 2,
      maxCompactedBlocks: 2,
    })
    expect(r2.metadata.compactedBlocks).toBeGreaterThan(0)
    expect(r2.metadata.projectedMessageCount).toBeLessThan(large.length)
  })

  it('orphan tool messages are silently dropped from projected messages', () => {
    resetIds()
    // Simulate a broken transcript where a tool result has no matching assistant
    const entries = [
      userEntry('task'),
      toolResult('orphan_tc', 'stray result'), // orphan: no preceding assistant tool_call
      assistantWithTools(['tc1']),
      toolResult('tc1', 'valid result'),
    ]

    const result = projectTranscript(entries, baseOpts)

    // The orphan tool message must NOT appear in projected messages
    const toolMsgs = result.messages.filter(m => m.role === 'tool')
    expect(toolMsgs).toHaveLength(1)
    expect(toolMsgs[0].tool_call_id).toBe('tc1')

    // No orphan: every tool message has a matching assistant tool_call
    const declaredIds = new Set<string>()
    for (const m of result.messages) {
      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) declaredIds.add(tc.id)
      }
    }
    for (const m of result.messages) {
      if (m.role === 'tool') {
        expect(declaredIds.has(m.tool_call_id!)).toBe(true)
      }
    }
  })

  it('does not emit incomplete tool-call blocks into provider messages', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1', 'tc2']),
      toolResult('tc1', 'partial result'),
      assistantText('continued after restart'),
    ]

    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 5,
      maxCompactedBlocks: 5,
    })

    expect(result.messages.some(m => m.role === 'assistant' && !!m.tool_calls)).toBe(false)
    expect(result.messages.some(m => m.role === 'tool')).toBe(false)
    expect(result.messages.some(m => m.content === 'continued after restart')).toBe(true)
    expect(result.system).not.toContain('Compacted tool interaction')
    expect(result.messages.some(m =>
      m.role === 'assistant'
      && !m.tool_calls
      && typeof m.content === 'string'
      && m.content.includes('Compacted tool interaction'),
    )).toBe(true)
    expect(result.metadata.compactedBlocks).toBe(1)
  })
})
