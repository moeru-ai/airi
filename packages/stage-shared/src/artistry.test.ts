import { safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { artistryGlobalsSchema } from './artistry'

describe('comfyUI generation timeout configuration', () => {
  it('uses ten minutes when the setting is absent', () => {
    const result = safeParse(artistryGlobalsSchema, {})
    expect(result).toMatchObject({ success: true, output: { comfyuiGenerationTimeoutMinutes: 10 } })
  })

  it.each([5, 30, 60])('accepts the configured window %s', (minutes) => {
    const result = safeParse(artistryGlobalsSchema, { comfyuiGenerationTimeoutMinutes: minutes })
    expect(result).toMatchObject({ success: true, output: { comfyuiGenerationTimeoutMinutes: minutes } })
  })

  it.each([4, 61, Number.NaN, Number.POSITIVE_INFINITY, '10', null])('rejects an invalid window %s', (minutes) => {
    expect(safeParse(artistryGlobalsSchema, { comfyuiGenerationTimeoutMinutes: minutes }).success).toBe(false)
  })
})
