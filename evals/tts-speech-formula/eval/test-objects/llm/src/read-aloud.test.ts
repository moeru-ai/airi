import { describe, expect, it } from 'vitest'

import { rewritePrompt } from './read-aloud'

describe('rewritePrompt', () => {
  it('names the language of the voice', async () => {
    expect(await rewritePrompt('ko')).toContain('natural Korean words')
  })
})
