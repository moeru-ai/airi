import { describe, expect, it } from 'vitest'

import { getServerCliHelpText, parseServerRole } from '../run'

describe('server cli', () => {
  it('parses supported roles', () => {
    expect(parseServerRole(['api'])).toBe('api')
    expect(parseServerRole(['billing-consumer'])).toBe('billing-consumer')
    expect(parseServerRole(['cache-sync-consumer'])).toBe('cache-sync-consumer')
    expect(parseServerRole(['outbox-dispatcher'])).toBe('outbox-dispatcher')
  })

  it('returns null for unsupported or missing roles', () => {
    expect(parseServerRole([])).toBeNull()
    expect(parseServerRole(['unknown'])).toBeNull()
  })

  it('returns help text that lists all supported roles', () => {
    expect(getServerCliHelpText()).toContain('Usage: server <role>')
    expect(getServerCliHelpText()).toContain('api')
    expect(getServerCliHelpText()).toContain('billing-consumer')
    expect(getServerCliHelpText()).toContain('cache-sync-consumer')
    expect(getServerCliHelpText()).toContain('outbox-dispatcher')
  })
})
