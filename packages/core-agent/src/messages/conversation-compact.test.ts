import type { Conversation, GenerationRound } from './types'

import { describe, expect, it, vi } from 'vitest'

import { ConversationCompact } from './conversation-compact'

function barrier<T>() {
  let release: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function round(index: number): GenerationRound {
  return {
    id: `run/${index}`,
    content: [{ type: 'text', text: 'observation '.repeat(100) }, { type: 'tool', invocationId: `tool-${index}` }],
    toolInvocations: [{ id: `tool-${index}`, callId: `call-${index}`, name: 'observe', arguments: '{}', execution: {
      status: 'succeeded',
      output: [{ type: 'text', text: '{"status":"unknown","exitCode":null,"noNewDispatch":false}' }, { type: 'image', url: `data:image/png;base64,${'A'.repeat(2000)}` }],
    } }],
    projectionIssues: [],
  }
}

function conversation(): Conversation {
  return { turns: [
    { type: 'system', id: 'system', authority: 'system', content: [{ type: 'text', text: 'System instructions' }] },
    { type: 'user', id: 'owner', content: [{ type: 'text', text: 'Original goal. Observe the fixture and stop on uncertainty.' }] },
    { type: 'assistant', id: 'run', status: 'completed', rounds: [0, 1, 2, 3].map(round) },
    { type: 'user', id: 'notice', content: [{ type: 'text', text: '[Host Notice] action=a, status=unknown, noNewDispatch=false. Do not replay.' }] },
  ] }
}

const measure = (value: Conversation) => new TextEncoder().encode(JSON.stringify(value)).byteLength
const target = { scope: 'session/model', measureContextBytes: measure }
const limits = { softLimitBytes: 6000, hardLimitBytes: 23000, retainRounds: 1 }

describe('conversationCompact', () => {
  it('freezes the background prefix, retains exact receipts, and merges a later delta', async () => {
    const gate = barrier<string>()
    const started = barrier<Conversation>()
    const summarize = vi.fn(async (snapshot: Conversation) => {
      started.release(snapshot)
      return gate.promise
    })
    const compact = new ConversationCompact(limits)
    const request = { ...target, summarize }
    const source = conversation()
    const original = structuredClone(source)
    const first = await compact.prepare(source, request)
    expect(measure(first)).toBeGreaterThan(limits.softLimitBytes)
    const snapshot = await started.promise
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.turns[0])).toBe(true)
    const delta: Conversation = { turns: [...source.turns, { type: 'user', id: 'delta', content: [{ type: 'text', text: 'New fact arrived during compression.' }] }] }
    await compact.prepare(delta, request)
    expect(JSON.stringify(snapshot)).not.toContain('New fact')
    gate.release('Earlier visual observations.')
    await gate.promise
    await Promise.resolve()
    await Promise.resolve()
    const merged = await compact.prepare(delta, request)
    expect(measure(merged)).toBeLessThan(measure(delta))
    expect(merged.turns.find(turn => turn.id === 'delta')).toEqual(delta.turns.at(-1))
    expect(merged.turns.find(turn => turn.id === 'notice')).toEqual(original.turns.at(-1))
    expect(merged.turns.find(turn => turn.id === 'owner')).toEqual(original.turns[1])
    expect(merged.turns.find(turn => turn.id.startsWith('compact-'))).toMatchObject({ authority: 'context' })
    const ledger = merged.turns.flatMap(turn => turn.type === 'assistant' ? turn.rounds.flatMap(item => item.toolInvocations) : [])
    expect(ledger.map(call => call.callId)).toEqual(['call-0', 'call-1', 'call-2', 'call-3'])
    expect(ledger.every(call => call.execution.status === 'succeeded' && call.execution.output[0].type === 'text' && call.execution.output[0].text.includes('"noNewDispatch":false'))).toBe(true)
    expect(source).toEqual(original)
    expect(summarize).toHaveBeenCalledOnce()
  })

  it('holds a hard-budget request at a barrier, then releases only the compacted view', async () => {
    const gate = barrier<string>()
    const started = barrier<void>()
    const compact = new ConversationCompact(limits)
    const request = { ...target, summarize: async () => {
      started.release()
      return gate.promise
    } }
    const source = conversation()
    await compact.prepare(source, request)
    await started.promise
    const delta: Conversation = { turns: [...source.turns, { type: 'user', id: 'large-delta', content: [{ type: 'text', text: 'D'.repeat(10000) }] }] }
    let dispatched = 0
    const pending = compact.prepare(delta, request).then((value) => {
      dispatched++
      return value
    })
    await Promise.resolve()
    expect(dispatched).toBe(0)
    gate.release('Visual observations retained.')
    const result = await pending
    expect(dispatched).toBe(1)
    expect(measure(result)).toBeLessThan(limits.hardLimitBytes)
    expect(result.turns.find(turn => turn.id === 'large-delta')).toEqual(delta.turns.at(-1))
  })

  it.each(['edit', 'scope', 'reset', 'cancel'] as const)('discards a stale summary after %s', async (change) => {
    const gate = barrier<string>()
    const started = barrier<AbortSignal>()
    const summarize = vi.fn(async (_snapshot: Conversation, signal: AbortSignal) => {
      started.release(signal)
      return gate.promise
    })
    const compact = new ConversationCompact(limits)
    const request = { ...target, summarize }
    const controller = new AbortController()
    const source = conversation()
    await compact.prepare(source, request, controller.signal)
    const signal = await started.promise
    const next = structuredClone(source)
    if (change === 'edit' && next.turns[1].type === 'user')
      next.turns[1].content = [{ type: 'text', text: 'Edited goal' }]
    if (change === 'reset')
      compact.reset()
    if (change === 'cancel')
      controller.abort()
    const currentTarget = change === 'scope' ? { ...request, scope: 'other-session/model' } : request
    const projected = await compact.prepare(next, currentTarget)
    expect(signal.aborted).toBe(true)
    gate.release('STALE summary')
    await gate.promise
    await Promise.resolve()
    expect(JSON.stringify(projected)).not.toContain('STALE summary')
    compact.reset()
  })

  it('cancels a hard-budget wait even when the summarizer ignores cancellation', async () => {
    const started = barrier<void>()
    const compact = new ConversationCompact(limits)
    const request = { ...target, summarize: async () => {
      started.release()
      return new Promise<string>(() => {})
    } }
    await compact.prepare(conversation(), request)
    await started.promise
    const source = conversation()
    source.turns.push({ type: 'user', id: 'delta', content: [{ type: 'text', text: 'D'.repeat(10000) }] })
    let dispatches = 0
    const controller = new AbortController()
    const pending = compact.prepare(source, request, controller.signal).then(() => {
      dispatches++
    })
    controller.abort(new Error('User cancelled'))
    await expect(pending).rejects.toThrow('User cancelled')
    expect(dispatches).toBe(0)
    compact.reset()
  })

  it('stops rather than retrying failed or ineffective summaries at the hard budget', async () => {
    for (const summarize of [vi.fn(async () => {
      throw new Error('Provider unavailable')
    }), vi.fn(async () => 'large '.repeat(6000))]) {
      const compact = new ConversationCompact(limits)
      const request = { ...target, summarize }
      const source = conversation()
      await compact.prepare(source, request)
      await Promise.resolve()
      await Promise.resolve()
      const delta: Conversation = { turns: [...source.turns, { type: 'user', id: 'delta', content: [{ type: 'text', text: 'D'.repeat(10000) }] }] }
      await expect(compact.prepare(delta, request)).rejects.toThrow('context exceeds')
      await expect(compact.prepare(delta, request)).rejects.toThrow('context exceeds')
      expect(summarize).toHaveBeenCalledOnce()
    }
  })

  it('keeps pending, failed and opaque rounds intact and refuses oversized pinned context', async () => {
    const source = conversation()
    const assistant = source.turns[2]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    assistant.rounds[0].toolInvocations[0].execution = { status: 'pending' }
    assistant.rounds[1].toolInvocations[0].execution = { status: 'failed', output: [{ type: 'text', text: 'Side effect occurred. Response lost.' }] }
    assistant.rounds[2].projectionIssues.push('Opaque native result')
    const summarize = vi.fn(async () => 'Never called')
    const compact = new ConversationCompact(limits)
    const request = { ...target, summarize }
    expect(await compact.prepare(source, request)).toEqual({ turns: [source.turns[0], source.turns[1], ...assistant.rounds.map(item => ({ ...assistant, rounds: [item] })), source.turns[3]] })
    source.turns.push({ type: 'user', id: 'large-goal', content: [{ type: 'text', text: 'P'.repeat(25000) }] })
    await expect(compact.prepare(source, request)).rejects.toThrow('context exceeds')
    expect(summarize).not.toHaveBeenCalled()
  })
})
