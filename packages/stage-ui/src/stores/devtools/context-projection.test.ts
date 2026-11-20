import { measureContextBudget } from '@proj-airi/core-agent'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useContextObservabilityStore } from './context-observability'
import { classifySerializedProjection, groupProjectionSections, reportedWindowUsage } from './context-projection'

const imageUrl = `data:image/png;base64,${'A'.repeat(64)}`

function expectBytesReconcile(value: unknown) {
  const breakdown = classifySerializedProjection(value)
  const measured = measureContextBudget(value)
  const assigned = breakdown.sections.reduce((total, section) => total + section.totalBytes, 0)
  const assignedImages = breakdown.sections.reduce((total, section) => total + section.imageBytes, 0)

  expect(breakdown.totalBytes).toBe(measured.totalBytes)
  expect(breakdown.textBytes).toBe(measured.textBytes)
  expect(breakdown.imageBytes).toBe(measured.imageBytes)
  expect(assigned + breakdown.framingBytes).toBe(breakdown.totalBytes)
  expect(assignedImages).toBe(breakdown.imageBytes)
  expect(breakdown).not.toHaveProperty('tokens')
  return breakdown
}

describe('reportedWindowUsage', () => {
  it('uses reported input tokens over the model window and skips a missing window', () => {
    expect(reportedWindowUsage(undefined, 25_000)).toBeUndefined()
    expect(reportedWindowUsage(Number.NaN, 25_000)).toBeUndefined()
    expect(reportedWindowUsage(-100_000, 25_000)).toBeUndefined()
    expect(reportedWindowUsage(100_000, null)).toBeUndefined()
    expect(reportedWindowUsage(100_000, undefined)).toBeUndefined()
    expect(reportedWindowUsage(100_000, Number.NaN)).toBeUndefined()
    expect(reportedWindowUsage(100_000, -1)).toBeUndefined()
    expect(reportedWindowUsage(100_000, 25_000)).toEqual({ label: '25.0', bar: 25, over: false })
    expect(reportedWindowUsage(100_000, 0)).toEqual({ label: '0.0', bar: 0, over: false })
    expect(reportedWindowUsage(100_000, 250_000)).toEqual({ label: '250.0', bar: 100, over: true })
  })
})

describe('groupProjectionSections', () => {
  it('groups sections by kind and keeps framing as its own row', () => {
    const breakdown = classifySerializedProjection({
      messages: [
        { role: 'system', content: 'You are AIRI.' },
        { role: 'user', content: 'Look' },
        { role: 'assistant', tool_calls: [{ id: '1', type: 'function', function: { name: 'observe', arguments: '{}' } }] },
        { role: 'tool', content: 'ok' },
      ],
      tools: [{ type: 'function', function: { name: 'observe', parameters: { type: 'object' } } }],
    })
    const groups = groupProjectionSections(breakdown)

    expect(groups.map(group => group.kind)).toEqual([
      'system-context',
      'conversation',
      'tool-call',
      'tool-result',
      'tool-schema',
      ...(breakdown.framingBytes > 0 ? ['framing'] as const : []),
    ])
    expect(groups.find(group => group.kind === 'tool-schema')?.sections).toHaveLength(1)
    expect(groups.reduce((total, group) => total + group.totalBytes, 0)).toBe(breakdown.totalBytes)
  })
})

describe('classifySerializedProjection', () => {
  it('returns an empty byte breakdown for empty values', () => {
    expect(classifySerializedProjection(undefined)).toEqual({
      textBytes: 0,
      imageBytes: 0,
      totalBytes: 0,
      framingBytes: 0,
      sections: [],
    })
    expect(classifySerializedProjection(null).sections).toEqual([])

    const empty = expectBytesReconcile({ messages: [], tools: [] })
    expect(empty.sections).toEqual([])
    expect(empty.imageBytes).toBe(0)
    expect(empty.framingBytes).toBe(empty.totalBytes)
  })

  it('separates text, inline images, and tool schemas without treating text data urls as images', () => {
    const payload = {
      messages: [
        { role: 'system', content: 'You are AIRI.' },
        { role: 'user', content: [
          { type: 'text', text: '看图' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] },
        { role: 'user', content: 'data:image/png;base64,not-an-image-field' },
      ],
      tools: [{ type: 'function', function: { name: 'observe', description: 'Look', parameters: { type: 'object' } } }],
    }

    const breakdown = expectBytesReconcile(payload)
    const system = breakdown.sections.find(section => section.kind === 'system-context')
    const text = breakdown.sections.find(section => section.title === 'Text')
    const image = breakdown.sections.find(section => section.title === 'Inline image')
    const schema = breakdown.sections.find(section => section.kind === 'tool-schema')
    const disguised = breakdown.sections.find(section => section.preview.includes('not-an-image-field'))

    expect(system).toMatchObject({ title: 'System', imageBytes: 0 })
    expect(text?.imageBytes).toBe(0)
    expect(text?.textBytes).toBeGreaterThan(0)
    expect(image?.imageBytes).toBeGreaterThan(image?.textBytes ?? 0)
    expect(image?.preview).not.toContain('AAAA')
    expect(image?.preview).toContain('[inline image]')
    expect(schema).toMatchObject({ title: 'observe', imageBytes: 0 })
    expect(disguised?.imageBytes).toBe(0)
    expect(breakdown.imageBytes).toBe(image?.imageBytes)
  })

  it('classifies tool calls, tool results, and responses tool schemas', () => {
    const payload = {
      input: [
        { type: 'message', role: 'user', content: `Look here${'\n[Context]\n'}- screen: a settings window` },
        { type: 'function_call', call_id: 'call-1', name: 'observe', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call-1', output: [
          { type: 'input_text', text: 'settings window' },
          { type: 'input_image', image_url: imageUrl },
        ] },
      ],
      tools: [{ type: 'function', name: 'observe', description: null, parameters: { type: 'object' }, strict: true }],
    }

    const breakdown = expectBytesReconcile(payload)

    expect(breakdown.sections.map(section => [section.kind, section.title])).toEqual([
      ['conversation', 'Message'],
      ['system-context', 'Context'],
      ['tool-call', 'observe'],
      ['tool-result', 'Text'],
      ['tool-result', 'Inline image'],
      ['tool-schema', 'observe'],
    ])
    expect(breakdown.sections.find(section => section.title === 'Context')?.preview).toContain('settings window')
    expect(breakdown.sections.find(section => section.kind === 'tool-call')?.preview).toContain('observe')
    expect(breakdown.sections.filter(section => section.title === 'Inline image')).toHaveLength(1)
  })

  it('keeps chat tool calls out of the assistant text', () => {
    const payload = {
      messages: [{
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'observe', arguments: '{}' } }],
      }, {
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'done',
      }],
    }

    const breakdown = expectBytesReconcile(payload)

    expect(breakdown.sections.map(section => section.kind)).toEqual(['conversation', 'tool-call', 'tool-result'])
    expect(breakdown.sections.find(section => section.kind === 'tool-call')?.title).toBe('observe')
    expect(breakdown.imageBytes).toBe(0)
  })

  it('wraps a string Responses input and does not double-count tools', () => {
    const payload = {
      input: 'Look at the settings window',
      tools: [{ type: 'function', name: 'observe', parameters: { type: 'object' } }],
    }

    const breakdown = expectBytesReconcile(payload)
    const assigned = breakdown.sections.reduce((total, section) => total + section.totalBytes, 0)

    expect(breakdown.sections.map(section => [section.kind, section.title])).toEqual([
      ['conversation', 'Message'],
      ['tool-schema', 'observe'],
    ])
    expect(assigned).toBeLessThanOrEqual(breakdown.totalBytes)
    expect(breakdown.sections.find(section => section.kind === 'conversation')?.preview).toBe('Look at the settings window')
  })

  it('classifies Anthropic tool_use and tool_result content blocks', () => {
    const payload = {
      messages: [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', id: 'toolu_1', name: 'observe', input: { target: 'settings' } },
        ],
      }, {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'settings window' },
        ],
      }],
    }

    const breakdown = expectBytesReconcile(payload)

    expect(breakdown.sections.map(section => [section.kind, section.title])).toEqual([
      ['conversation', 'Text'],
      ['tool-call', 'observe'],
      ['tool-result', 'Tool result'],
    ])
  })

  it('classifies a tools-only request without treating the whole object as conversation', () => {
    const payload = {
      tools: [{ type: 'function', name: 'observe', parameters: { type: 'object' } }],
    }

    const breakdown = expectBytesReconcile(payload)

    expect(breakdown.sections.map(section => section.kind)).toEqual(['tool-schema'])
    expect(breakdown.sections[0]?.title).toBe('observe')
  })

  it('classifies top-level system and instructions before messages', () => {
    const anthropic = expectBytesReconcile({
      system: [{ type: 'text', text: 'You are AIRI.' }],
      messages: [{ role: 'user', content: 'Hi' }],
    })
    const responses = expectBytesReconcile({
      instructions: 'You are AIRI.',
      input: [{ type: 'message', role: 'user', content: 'Hi' }],
    })
    const instructionsOnly = expectBytesReconcile({
      instructions: 'You are AIRI.',
    })

    expect(anthropic.sections.map(section => [section.kind, section.title])).toEqual([
      ['system-context', 'Text'],
      ['conversation', 'Message'],
    ])
    expect(responses.sections.map(section => [section.kind, section.title])).toEqual([
      ['system-context', 'System'],
      ['conversation', 'Message'],
    ])
    expect(instructionsOnly.sections.map(section => section.kind)).toEqual(['system-context'])
    expect(anthropic.sections[0]?.preview).toContain('You are AIRI.')
    expect(responses.sections[0]?.preview).toBe('You are AIRI.')
  })

  it('bounds large object previews instead of pretty-printing the full tree', () => {
    const payload = {
      messages: [{
        role: 'tool',
        content: { blob: 'x'.repeat(12_000), nested: { deep: true } },
      }],
    }

    const breakdown = expectBytesReconcile(payload)
    const preview = breakdown.sections[0]?.preview ?? ''

    expect(preview.length).toBeLessThanOrEqual(8_001)
    expect(preview).toContain('…')
    expect(preview).not.toContain('x'.repeat(3_000))
  })
})

describe('context observability projection capture', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores serialized bytes and only a reported usage for the captured request', () => {
    const store = useContextObservabilityStore()
    store.capturePromptProjection({
      sessionId: 'session-1',
      message: 'Look',
      contexts: {},
      composedMessage: [{ role: 'user', content: 'previous' }],
    })
    store.captureProviderPromptProjection('session-1', [{ role: 'user', content: 'previous' }], {
      model: 'old-model',
      contextWindowTokens: 1.5,
      serializedProjection: { messages: [{ role: 'user', content: 'previous' }] },
    })
    store.recordReportedUsage('session-1', { inputTokens: 9, source: 'reported' })

    store.captureProviderPromptProjection('session-1', [{ role: 'user', content: 'Look' }], {
      model: 'gpt-test',
      providerId: 'mock-provider',
      contextWindowTokens: Number.NaN,
      modelMaxOutputTokens: -1,
      serializedProjection: {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url: imageUrl } }] }],
        tools: [{ type: 'function', function: { name: 'observe', parameters: {} } }],
      },
    })

    const projection = store.lastPromptProjection
    expect(projection?.providerCaptured).toBe(true)
    expect(projection?.request).toMatchObject({
      model: 'gpt-test',
      providerId: 'mock-provider',
      budgetLimits: { source: 'bounded-byte-fallback' },
    })
    expect(projection?.request?.contextWindowTokens).toBeUndefined()
    expect(projection?.request?.modelMaxOutputTokens).toBeUndefined()
    expect(projection?.reportedUsage).toBeUndefined()
    expect(projection?.breakdown?.imageBytes).toBeGreaterThan(0)
    expect(projection?.breakdown?.sections.some(section => section.kind === 'tool-schema')).toBe(true)
    expect(JSON.stringify(projection?.breakdown)).not.toContain('AAAA')

    store.recordReportedUsage('session-1', { inputTokens: 4, outputTokens: 1, totalTokens: 5, source: 'estimated' })
    expect(store.lastPromptProjection?.reportedUsage).toBeUndefined()
    store.recordReportedUsage('session-1', { source: 'unavailable' })
    expect(store.lastPromptProjection?.reportedUsage).toBeUndefined()
    store.recordReportedUsage('session-2', { inputTokens: 4, source: 'reported' })
    expect(store.lastPromptProjection?.reportedUsage).toBeUndefined()
    store.recordReportedUsage('session-1', { inputTokens: 20, outputTokens: 5, totalTokens: 25, source: 'reported' })
    expect(store.lastPromptProjection?.reportedUsage).toMatchObject({
      inputTokens: 20,
      outputTokens: 5,
      totalTokens: 25,
      source: 'reported',
    })
  })

  it('keeps a real context window and drops the previous request when composition starts again', () => {
    const store = useContextObservabilityStore()
    store.capturePromptProjection({ sessionId: 'session-1', message: 'Hi', contexts: {} })
    store.captureProviderPromptProjection('session-1', [{ role: 'user', content: 'Hi' }], {
      model: 'gpt-test',
      contextWindowTokens: 128_000,
      requestedOutputTokens: 4_096,
    })
    store.recordReportedUsage('session-1', { inputTokens: 30, source: 'reported' })

    expect(store.lastPromptProjection?.request?.contextWindowTokens).toBe(128_000)
    expect(store.lastPromptProjection?.request?.budgetLimits.source).toBe('provider-model-metadata')

    store.capturePromptProjection({ sessionId: 'session-1', message: 'Next', contexts: {} })
    expect(store.lastPromptProjection?.providerCaptured).toBe(false)
    expect(store.lastPromptProjection?.breakdown).toBeUndefined()
    expect(store.lastPromptProjection?.reportedUsage).toBeUndefined()
    expect(store.lastPromptProjection?.request).toBeUndefined()
  })
})
