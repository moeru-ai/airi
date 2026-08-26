import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { kitDescriptorSchema } from './kits'

describe('kitDescriptorSchema', () => {
  it('accepts a generic host-level kit descriptor without business coupling', () => {
    const parsed = parse(kitDescriptorSchema, {
      capabilities: [
        {
          actions: ['announce', 'activate', 'update', 'withdraw'],
          key: 'kit.widget.module',
        },
      ],
      kitId: 'kit.widget',
      runtimes: ['electron', 'web'],
      version: '1.0.0',
    })

    expect(parsed.kitId).toBe('kit.widget')
    expect(parsed.runtimes).toContain('electron')
  })

  it('rejects an unsupported runtime', () => {
    expect(() =>
      parse(kitDescriptorSchema, {
        capabilities: [],
        kitId: 'kit.widget',
        runtimes: ['browser'],
        version: '1.0.0',
      }),
    ).toThrowError()
  })
})
