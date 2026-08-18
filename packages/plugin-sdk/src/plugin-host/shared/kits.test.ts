import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { kitDescriptorSchema } from './kits'

describe('kitDescriptorSchema', () => {
  it('accepts a generic host-level kit descriptor without business coupling', () => {
    const parsed = parse(kitDescriptorSchema, {
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [
        {
          key: 'kit.widget.module',
          actions: ['announce', 'activate', 'update', 'withdraw'],
        },
      ],
      runtimes: ['electron', 'web'],
    })

    expect(parsed.kitId).toBe('kit.widget')
    expect(parsed.runtimes).toContain('electron')
  })

  it('rejects an unsupported runtime', () => {
    expect(() =>
      parse(kitDescriptorSchema, {
        kitId: 'kit.widget',
        version: '1.0.0',
        capabilities: [],
        runtimes: ['browser'],
      }),
    ).toThrowError()
  })
})
