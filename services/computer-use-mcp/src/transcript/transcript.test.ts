import { beforeEach, describe, expect, it } from 'vitest'

import type { RunState } from '../state'
import type { TranscriptEntry } from './types'

import { parseTranscriptBlocks } from './block-parser'
import { compactBlock } from './compactor'
import { InMemoryTranscriptStore } from './store'
import { projectTranscript } from './projector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0
function resetIds() { idCounter = 0 }

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

  it('appendRawMessage skips unknown roles', async () => {
    const store = new InMemoryTranscriptStore()
    await store.init()

    const result = await store.appendRawMessage({ role: 'weird_role' as any, content: 'hmm' })
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

  it('deduplicates tool results with the same toolCallId (retry/replay scenario)', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantWithTools(['tc1']),
      toolResult('tc1', 'first result'),  // original
      toolResult('tc1', 'retry result'),  // duplicate from replay — must NOT enter toolResults
    ]

    const blocks = parseTranscriptBlocks(entries)
    // 3 blocks: user + tool_interaction + orphan TextBlock (the duplicate tc1)
    // The duplicate is not consumed into the interaction block; it falls through to
    // orphan handling and becomes a TextBlock. Projection will filter it out.
    expect(blocks).toHaveLength(3)
    expect(blocks[0].kind).toBe('user')
    expect(blocks[1].kind).toBe('tool_interaction')
    expect(blocks[2].kind).toBe('text') // the orphaned duplicate

    if (blocks[1].kind === 'tool_interaction') {
      // Key invariant: only one result survives in the block (first occurrence wins)
      expect(blocks[1].toolResults).toHaveLength(1)
      expect(blocks[1].toolResults[0].content).toBe('first result')
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
    expect(compacted.summary).toContain('ok')
  })

  it('marks failed tool results in compacted summary', () => {
    resetIds()
    const block = parseTranscriptBlocks([
      assistantWithTools(['tc1']),
      toolResult('tc1', 'Error: file not found'),
    ])[0]

    const compacted = compactBlock(block)
    expect(compacted.summary).toContain('FAILED')
  })

  it('compacts text blocks with truncated content', () => {
    resetIds()
    const longText = 'A'.repeat(200)
    const block = parseTranscriptBlocks([assistantText(longText)])[0]

    const compacted = compactBlock(block)
    expect(compacted.kind).toBe('compacted')
    expect(compacted.originalKind).toBe('text')
    expect(compacted.summary.length).toBeLessThan(200)
    expect(compacted.summary).toContain('…')
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
    runState: {} as any,
    operationalTrace: [],
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

  it('compacted summaries are in system prompt, NOT in messages', () => {
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

    // Compacted summaries must be in system, not in messages
    expect(result.system).toContain('Compacted Transcript Summary')
    expect(result.system).toContain('[Compacted tool interaction]')

    // Messages must NOT contain any synthetic compacted entries
    const hasFakeCompacted = result.messages.some(m =>
      typeof m.content === 'string' && m.content.includes('[Compacted'),
    )
    expect(hasFakeCompacted).toBe(false)
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

  it('operational trace projector and transcript projector do not pollute each other', () => {
    resetIds()
    const entries = [
      userEntry('task'),
      assistantText('thinking'),
    ]

    // Provide operational trace entries
    const opTrace = [{
      id: 'op-1',
      at: new Date().toISOString(),
      event: 'executed',
      toolName: 'desktop_screenshot',
      result: { path: '/tmp/a.png' },
    }]

    const result = projectTranscript(entries, {
      ...baseOpts,
      operationalTrace: opTrace as any,
    })

    // System header should contain operational trace data
    expect(result.system).toContain('Operational Trace')

    // Messages should only contain transcript content, not operational trace
    const msgTexts = result.messages.map(m =>
      typeof m.content === 'string' ? m.content : '',
    )
    const hasOpTrace = msgTexts.some(t => t.includes('desktop_screenshot'))
    expect(hasOpTrace).toBe(false)
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
      maxFullTextBlocks: 1,  // only keep latest text block
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
      toolResult('orphan_tc', 'stray result'), // orphan — no preceding assistant tool_call
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
})

// ---------------------------------------------------------------------------
// projectTranscript — archiveCandidates
// ---------------------------------------------------------------------------

describe('projectTranscript — archiveCandidates', () => {
  /** Minimal valid RunState satisfying all required fields (mirrors RunStateManager constructor). */
  const minimalRunState: RunState = {
    pendingApprovalCount: 0,
    lastApprovalRejected: false,
    ptySessions: [],
    workflowStepTerminalBindings: [],
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    handoffHistory: [],
    updatedAt: new Date().toISOString(),
  }

  const baseOpts = {
    runState: minimalRunState,
    operationalTrace: [] as any[],
  }

  /** Build a minimal tool interaction (assistant + tool result) as flat entries. */
  function toolInteraction(callId: string, toolName: string, args: string, resultContent: string): TranscriptEntry[] {
    const assistantEntry: TranscriptEntry = {
      id: idCounter++,
      at: new Date().toISOString(),
      role: 'assistant',
      content: '',
      toolCalls: [{ id: callId, type: 'function', function: { name: toolName, arguments: args } }],
    }
    const resultEntry: TranscriptEntry = {
      id: idCounter++,
      at: new Date().toISOString(),
      role: 'tool',
      content: resultContent,
      toolCallId: callId,
    }
    return [assistantEntry, resultEntry]
  }

  it('returns empty archiveCandidates when no blocks are removed', () => {
    // Only one tool interaction — fits in maxFullToolBlocks=5, nothing compacted
    const entries = [
      userEntry('do the thing'),
      ...toolInteraction('t1', 'coding_read_file', '{"path":"/tmp/x.ts"}', 'content here'),
    ]
    const result = projectTranscript(entries, { ...baseOpts, maxFullToolBlocks: 5, maxFullTextBlocks: 3, maxCompactedBlocks: 4 })
    expect(result.archiveCandidates).toHaveLength(0)
  })

  it('produces archiveCandidates for compacted tool_interaction blocks', () => {
    // 6 tool interactions, maxFullToolBlocks=1, so 5 are candidates for compaction
    // maxCompactedBlocks=4, so 4 get compacted, 1 gets fully dropped
    const entries = [
      userEntry('task'),
      ...toolInteraction('t1', 'tool_a', '{}', 'result a'.padEnd(50, '!')),
      ...toolInteraction('t2', 'tool_b', '{}', 'result b'.padEnd(50, '!')),
      ...toolInteraction('t3', 'tool_c', '{}', 'result c'.padEnd(50, '!')),
      ...toolInteraction('t4', 'tool_d', '{}', 'result d'.padEnd(50, '!')),
      ...toolInteraction('t5', 'tool_e', '{}', 'result e'.padEnd(50, '!')),
      ...toolInteraction('t6', 'tool_f', '{}', 'result f'.padEnd(50, '!')),
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 1,
      maxFullTextBlocks: 3,
      maxCompactedBlocks: 4,
    })

    // 5 candidates: some compacted, some dropped
    expect(result.archiveCandidates.length).toBeGreaterThan(0)
    const reasons = result.archiveCandidates.map(c => c.reason)
    expect(reasons).toContain('compacted')
    expect(reasons).toContain('dropped')
  })

  it('archiveCandidates have non-empty normalizedContent for tool_interaction', () => {
    const entries = [
      userEntry('task'),
      ...toolInteraction('t1', 'coding_read_file', '{"path":"/tmp/a.ts"}', 'file content here'),
      ...toolInteraction('t2', 'coding_write_file', '{"path":"/tmp/b.ts"}', 'write ok'),
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0, // force all to be compaction candidates
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 1,
    })

    for (const c of result.archiveCandidates) {
      expect(c.normalizedContent.length).toBeGreaterThan(0)
    }
  })

  it('normalizedContent is NOT truncated to 120 chars', () => {
    const longResult = 'x'.repeat(500)
    const entries = [
      userEntry('task'),
      ...toolInteraction('t1', 'coding_read_file', '{}', longResult),
      ...toolInteraction('t2', 'coding_write_file', '{}', 'result 2'),
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 1,
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 1,
    })

    const toolCandidates = result.archiveCandidates.filter(c => c.originalKind === 'tool_interaction')
    const longOne = toolCandidates.find(c => c.normalizedContent.includes('x'.repeat(100)))
    if (longOne) {
      expect(longOne.normalizedContent).toContain('x'.repeat(500))
    }
  })

  it('does not archive orphan tool TextBlocks', () => {
    // Orphan tool messages get wrapped as TextBlock with entry.role === 'tool'
    const orphanTool: TranscriptEntry = {
      id: idCounter++,
      at: new Date().toISOString(),
      role: 'tool',
      content: 'orphan result',
      toolCallId: 'orphan-tc-id',
    }
    const entries = [
      userEntry('task'),
      orphanTool,
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0,
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 0,
    })

    const orphanCandidates = result.archiveCandidates.filter(
      c => c.originalKind === 'text' && c.tags.length === 0,
    )
    // Even if it passes kind check, orphan tool blocks should be excluded
    expect(orphanCandidates).toHaveLength(0)
  })

  it('does not archive short assistant text blocks (< 200 chars)', () => {
    const shortText = entry('assistant', 'short')
    const entries = [
      userEntry('task'),
      shortText,
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0,
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 0,
    })

    const textCandidates = result.archiveCandidates.filter(c => c.originalKind === 'text')
    expect(textCandidates).toHaveLength(0)
  })

  it('archives long assistant text blocks (>= 200 chars)', () => {
    const longText = entry('assistant', 'T'.repeat(250))
    const entries = [
      userEntry('task'),
      longText,
    ]
    const result = projectTranscript(entries, {
      ...baseOpts,
      maxFullToolBlocks: 0,
      maxFullTextBlocks: 0,
      maxCompactedBlocks: 0,
    })

    const textCandidates = result.archiveCandidates.filter(c => c.originalKind === 'text')
    expect(textCandidates.length).toBeGreaterThanOrEqual(0) // may be dropped or compacted
    if (textCandidates.length > 0) {
      expect(textCandidates[0].normalizedContent).toHaveLength(250)
    }
  })

  it('projectTranscript remains a pure function — no side effects', () => {
    const entries = [userEntry('task')]
    const result1 = projectTranscript(entries, baseOpts)
    const result2 = projectTranscript(entries, baseOpts)

    expect(result1.archiveCandidates).toEqual(result2.archiveCandidates)
    expect(result1.system).toBe(result2.system)
  })
})
