import { describe, expect, it } from 'vitest'

import { createServerCli, parseServerRole } from '../run'

describe('server cli', () => {
  it('parses supported roles', () => {
    expect(parseServerRole(['api'])).toBe('api')
    expect(parseServerRole(['billing-consumer'])).toBe('billing-consumer')
  })

  it('returns null for unsupported or missing roles', () => {
    expect(parseServerRole([])).toBeNull()
    expect(parseServerRole(['unknown'])).toBeNull()
  })

  it('registers all supported roles with cac', () => {
    const cli = createServerCli()

    expect(cli.commands.map(command => command.name)).toEqual(expect.arrayContaining([
      'api',
      'billing-consumer',
    ]))
  })
})
