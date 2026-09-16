import { describe, expect, it } from 'vitest'

import { normalizeReplScript } from './repl-code-normalizer'

describe('normalizeReplScript', () => {
  it('rewrites top-level variable declarations and trailing expression', () => {
    const normalized = normalizeReplScript('const nearestLog = query.blocks().first(); nearestLog')

    expect(normalized).toContain('globalThis.nearestLog = query.blocks().first();')
    expect(normalized).toContain('return (nearestLog)')
    expect(normalized).not.toContain('return (globalThis.nearestLog = query.blocks().first(); nearestLog)')
  })

  it('does not rewrite trailing expression when explicit return exists', () => {
    const normalized = normalizeReplScript(`
const inv = [{ name: 'oak_log' }]
return inv
`)

    expect(normalized).toContain('globalThis.inv = [{ name: \'oak_log\' }];')
    expect(normalized).toContain('return inv')
    expect(normalized).not.toContain('return (inv)')
  })

  it('leaves scripts unchanged when parser reports diagnostics', () => {
    const script = 'const broken = ;'
    expect(normalizeReplScript(script)).toBe(script)
  })

  it('keeps non-expression trailing statements without implicit return', () => {
    const normalized = normalizeReplScript(`
const x = 1
if (x > 0) {
  x
}
`)

    expect(normalized).toContain('globalThis.x = 1;')
    expect(normalized).not.toContain('return (')
  })
})
