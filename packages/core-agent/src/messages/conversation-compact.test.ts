import type { Conversation, GenerationRound } from './types'

import { describe, expect, it, vi } from 'vitest'

import { measureContextBudget } from './context-budget'
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
  it('defaults to Off without summary dispatch and retains the hard request gate', async () => {
    const summarize = vi.fn(async () => 'Not requested')
    const compact = new ConversationCompact(limits)
    const source = conversation()
    await compact.prepare(source, { ...target, summarize })
    expect(summarize).not.toHaveBeenCalled()
    source.turns.push({ type: 'user', id: 'oversized', content: [{ type: 'text', text: 'D'.repeat(25000) }] })
    let providerDispatches = 0
    await expect(compact.prepare(source, { ...target, summarize }).then(() => {
      providerDispatches++
    })).rejects.toThrow('context exceeds')
    expect(providerDispatches).toBe(0)
    expect(summarize).not.toHaveBeenCalled()
    console.info(JSON.stringify({ mode: 'off', summaryDispatches: summarize.mock.calls.length, providerDispatches }))
  })

  it('keeps a vision request eligible when inline image bytes exceed the text gate', async () => {
    const compact = new ConversationCompact({ softLimitBytes: 100, hardLimitBytes: 1000, retainRounds: 1 })
    const source: Conversation = { turns: [{ type: 'user', id: 'image', content: [
      { type: 'text', text: 'Describe this image.' },
      { type: 'image', url: `data:image/png;base64,${'A'.repeat(5000)}` },
    ] }] }
    const request = {
      scope: 'vision/model',
      measureContextBytes: measure,
      measureContextBudget,
      supportsVisionInput: true,
      summarize: vi.fn(async () => 'Never called'),
    }

    await expect(compact.prepare(source, request)).resolves.toEqual(source)
    expect(request.summarize).not.toHaveBeenCalled()
    expect(measureContextBudget(source).imageBytes).toBeGreaterThan(1000)

    const textOnly = new ConversationCompact({ softLimitBytes: 100, hardLimitBytes: 1000, retainRounds: 1 })
    await expect(textOnly.prepare(source, { ...request, supportsVisionInput: false })).rejects.toThrow('context exceeds')
  })

  it('uses the context budget of each resolved model request', async () => {
    const compact = new ConversationCompact({ softLimitBytes: 500, hardLimitBytes: 1000, retainRounds: 1 })
    const source: Conversation = { turns: [{ type: 'user', id: 'model-budget', content: [{ type: 'text', text: 'x'.repeat(300) }] }] }
    const request = {
      scope: 'model-budget/model',
      measureContextBytes: measure,
      contextBudgetLimits: { softLimitBytes: 100, hardLimitBytes: 200 },
      summarize: vi.fn(async () => 'unused'),
    }

    await expect(compact.prepare(source, request)).rejects.toThrow('context exceeds')
    await expect(compact.prepare(source, { ...request, contextBudgetLimits: { softLimitBytes: 500, hardLimitBytes: 1000 } })).resolves.toEqual(source)
  })

  it('waits at the soft budget only in Synchronous mode and uses the shared projection', async () => {
    const gate = barrier<string>()
    const started = barrier<void>()
    const compact = new ConversationCompact(limits)
    compact.setMode('synchronous')
    let dispatches = 0
    const pending = compact.prepare(conversation(), { ...target, summarize: async () => {
      started.release()
      return gate.promise
    } }).then((value) => {
      dispatches++
      return value
    })
    await started.promise
    expect(dispatches).toBe(0)
    gate.release('Earlier observations.')
    const value = await pending
    expect(dispatches).toBe(1)
    expect(measure(value)).toBeLessThan(measure(conversation()))
  })

  it.each(['off', 'synchronous'] as const)('invalidates Background work immediately when switching to %s', async (mode) => {
    const gate = barrier<string>()
    const started = barrier<AbortSignal>()
    const compact = new ConversationCompact(limits)
    compact.setMode('background')
    const executeSignal = new AbortController()
    let effects = 0
    const executorGate = barrier<void>()
    const executor = executorGate.promise.then(() => {
      executeSignal.signal.throwIfAborted()
      effects++
    })
    await compact.prepare(conversation(), { ...target, summarize: async (_snapshot, signal) => {
      started.release(signal)
      return gate.promise
    } }, executeSignal.signal)
    const summarySignal = await started.promise
    compact.setMode(mode)
    expect(summarySignal.aborted).toBe(true)
    expect(executeSignal.signal.aborted).toBe(false)
    gate.release('STALE')
    await gate.promise
    await Promise.resolve()
    compact.setMode('off')
    expect(JSON.stringify(await compact.prepare(conversation(), { ...target, summarize: async () => 'Never' }))).not.toContain('STALE')
    executorGate.release()
    await executor
    expect(effects).toBe(1)
    console.info(JSON.stringify({ change: mode, summaryAborted: summarySignal.aborted, executorAborted: executeSignal.signal.aborted, effects }))
  })

  it.each(['off', 'background'] as const)('continues a soft-budget synchronous wait after switching to %s', async (mode) => {
    const started = barrier<void>()
    const compact = new ConversationCompact(limits)
    compact.setMode('synchronous')
    const pending = compact.prepare(conversation(), { ...target, summarize: async () => {
      started.release()
      return new Promise<string>(() => {})
    } })
    await started.promise
    compact.setMode(mode)
    expect(measure(await pending)).toBeLessThan(limits.hardLimitBytes)
    compact.reset()
  })

  it('does not bypass the hard gate when Off interrupts a pending wait', async () => {
    const started = barrier<void>()
    const compact = new ConversationCompact(limits)
    compact.setMode('synchronous')
    const source = conversation()
    source.turns.push({ type: 'user', id: 'delta', content: [{ type: 'text', text: 'D'.repeat(10000) }] })
    let dispatches = 0
    const pending = compact.prepare(source, { ...target, summarize: async () => {
      started.release()
      return new Promise<string>(() => {})
    } }).then(() => { dispatches++ })
    const rejected = expect(pending).rejects.toThrow('context exceeds')
    await started.promise
    compact.setMode('off')
    await rejected
    expect(dispatches).toBe(0)
  })

  it('does not retry a failed prefix but admits one new summary when later images become eligible', async () => {
    const compact = new ConversationCompact({ softLimitBytes: 6000, hardLimitBytes: 14000, retainRounds: 2 })
    compact.setMode('background')
    const summarize = vi.fn(async () => summarize.mock.calls.length === 1 ? 'ineffective '.repeat(6000) : 'Visual observations retained.')
    const request = { ...target, summarize }
    const source = conversation()
    await expect(compact.prepare(source, request)).rejects.toThrow('context exceeds')
    await expect(compact.prepare(source, request)).rejects.toThrow('context exceeds')
    expect(summarize).toHaveBeenCalledOnce()
    const next = structuredClone(source)
    const assistant = next.turns[2]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    assistant.rounds.push(round(4))
    const projected = await compact.prepare(next, request)
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(measure(projected)).toBeLessThan(14000)
    expect(projected.turns.flatMap(turn => turn.type === 'assistant' ? turn.rounds.flatMap(item => item.toolInvocations.map(call => call.callId)) : [])).toEqual(['call-0', 'call-1', 'call-2', 'call-3', 'call-4'])
    expect(JSON.stringify(projected)).toContain('"noNewDispatch\\":false')
    expect(source.turns[2]).toMatchObject({ rounds: expect.any(Array) })
    compact.reset()
  })

  it('does not summarize empty assistant text around exact text-only receipts', async () => {
    const source = conversation()
    const assistant = source.turns[2]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    for (const item of assistant.rounds) {
      item.content[0] = { type: 'text', text: '' }
      item.toolInvocations[0].execution = { status: 'succeeded', output: [{ type: 'text', text: 'Exact receipt '.repeat(200) }] }
    }
    const summarize = vi.fn(async () => 'No visual or narrative information to compress')
    const compact = new ConversationCompact(limits)
    compact.setMode('background')
    await compact.prepare(source, { ...target, summarize })
    await Promise.resolve()
    expect(summarize).not.toHaveBeenCalled()
    compact.reset()
  })

  it('freezes the background prefix, retains exact receipts, and merges a later delta', async () => {
    const gate = barrier<string>()
    const started = barrier<Conversation>()
    const summarize = vi.fn(async (snapshot: Conversation) => {
      started.release(snapshot)
      return gate.promise
    })
    const compact = new ConversationCompact(limits)
    compact.setMode('background')
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
    compact.setMode('background')
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
    compact.setMode('background')
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
    compact.setMode('background')
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

  it.each(['synchronous', 'background'] as const)('stops rather than retrying failed or ineffective %s summaries at the hard budget', async (mode) => {
    for (const summarize of [vi.fn(async () => {
      throw new Error('Provider unavailable')
    }), vi.fn(async () => 'large '.repeat(6000))]) {
      const compact = new ConversationCompact(limits)
      compact.setMode(mode)
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
    compact.setMode('background')
    const request = { ...target, summarize }
    expect(await compact.prepare(source, request)).toEqual({ turns: [source.turns[0], source.turns[1], ...assistant.rounds.map(item => ({ ...assistant, rounds: [item] })), source.turns[3]] })
    source.turns.push({ type: 'user', id: 'large-goal', content: [{ type: 'text', text: 'P'.repeat(25000) }] })
    await expect(compact.prepare(source, request)).rejects.toThrow('context exceeds')
    expect(summarize).not.toHaveBeenCalled()
  })
})
