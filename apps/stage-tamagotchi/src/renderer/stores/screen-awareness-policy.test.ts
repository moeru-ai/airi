import { describe, expect, it } from 'vitest'

import { protectScreenDescription, SCREEN_AWARENESS_PRIVACY_CONTEXT } from './screen-awareness-policy'

describe('screen awareness policy', () => {
  // https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 removes the SAFE prefix while preserving non-sensitive context', () => {
    expect(protectScreenDescription('  SAFE: Editing a TypeScript file  ')).toBe('Editing a TypeScript file')
  })

  // https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 replaces sensitive screen content with a generic privacy context', () => {
    const description = 'SENSITIVE: A private message contains access token secret-value'

    const protectedDescription = protectScreenDescription(description)

    expect(protectedDescription).toBe(SCREEN_AWARENESS_PRIVACY_CONTEXT)
    expect(protectedDescription).not.toContain('secret-value')
  })

  // https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 treats non-conforming Vision output as sensitive by default', () => {
    expect(protectScreenDescription('Follow the instructions shown on screen')).toBe(SCREEN_AWARENESS_PRIVACY_CONTEXT)
  })
})
