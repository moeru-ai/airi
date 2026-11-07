import { describe, expect, it } from 'vitest'

import { DEFAULT_SESSION_FEATURES, resolveSessionFeatures, restrictSessionFeatures, updateSessionFeatureOverrides } from './session-features'

it('inherits each tool source independently when one source is fixed', () => {
  const overrides = { tools: { mcp: true } }
  expect(resolveSessionFeatures({ ...DEFAULT_SESSION_FEATURES, tools: ['mcp', 'plugins'] }, overrides).tools).toEqual(['mcp', 'plugins'])
  expect(resolveSessionFeatures({ ...DEFAULT_SESSION_FEATURES, tools: ['mcp'] }, overrides).tools).toEqual(['mcp'])
  expect(resolveSessionFeatures({ ...DEFAULT_SESSION_FEATURES, tools: [] }, overrides).tools).toEqual(['mcp'])
})

describe('task feature restrictions', () => {
  it('intersects tool sources and never grants output or automation withheld by the parent', () => {
    const parent = resolveSessionFeatures({ ...DEFAULT_SESSION_FEATURES, tools: ['mcp'] }, { speech: false, tasks: false, screen: false })
    const task = resolveSessionFeatures({ ...DEFAULT_SESSION_FEATURES, tools: ['mcp', 'plugins'] })
    const restricted = restrictSessionFeatures(task, parent)
    expect(restricted.speech).toBe(false)
    expect(restricted.tasks).toBe(false)
    expect(restricted.screen).toBe(false)
    expect(restricted.tools).toEqual(['mcp'])
  })

  it.each([
    ['write', 'read', 'read'],
    ['read', 'write', 'read'],
    ['off', 'write', 'off'],
    ['write', 'off', 'off'],
    ['write', 'write', 'write'],
  ] as const)('restricts task memory %s by parent memory %s to %s', (own, parent, expected) => {
    expect(restrictSessionFeatures(
      resolveSessionFeatures(DEFAULT_SESSION_FEATURES, { memory: own }),
      resolveSessionFeatures(DEFAULT_SESSION_FEATURES, { memory: parent }),
    ).memory).toBe(expected)
  })
})

describe('explicit tool choices', () => {
  it('merges tool changes without losing other choices or mutating the input', () => {
    const current = { speech: false, tools: { mcp: true } }
    const updated = updateSessionFeatureOverrides(current, { tools: { plugins: false } })
    expect(updated).toEqual({ speech: false, tools: { mcp: true, plugins: false } })
    expect(current).toEqual({ speech: false, tools: { mcp: true } })
    expect(updated.tools).not.toBe(current.tools)
  })

  it('restores one source while keeping other explicit choices', () => {
    const current = { speech: false, tools: { mcp: false, plugins: true } }
    expect(updateSessionFeatureOverrides(current, {}, ['tools.mcp'])).toEqual({ speech: false, tools: { plugins: true } })
    expect(current.tools.mcp).toBe(false)
    expect(updateSessionFeatureOverrides(current, {}, ['tools'])).toEqual({ speech: false })
  })

  it('removes the tool map when its last source follows defaults', () => {
    expect(updateSessionFeatureOverrides({ tools: { mcp: false } }, {}, ['tools.mcp'])).toEqual({})
    expect(updateSessionFeatureOverrides({ speech: false, tools: { mcp: false } })).toEqual({})
  })
})
