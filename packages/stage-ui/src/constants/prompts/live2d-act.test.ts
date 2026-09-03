import { describe, expect, it } from 'vitest'

import { formatLive2DActPrompt } from './live2d-act'

describe('live2D ACT prompt', () => {
  it('returns an empty prompt without enabled controls', () => {
    expect(formatLive2DActPrompt([], [])).toBe('')
  })

  it('describes exact expression and motion identifiers', () => {
    const prompt = formatLive2DActPrompt(
      [{ name: '08_EyeCheerful', fileName: 'expressions/08_EyeCheerful.exp3.json' }],
      [{ fileName: 'motions/疑惑.motion3.json', group: 'AIRI', index: 1 }],
    )

    expect(prompt).toContain('<|ACT {"expression":{"name":"08_EyeCheerful","duration":3}}|>')
    expect(prompt).toContain('<|ACT {"expression":null}|>')
    expect(prompt).toContain('- "08_EyeCheerful"')
    expect(prompt).toContain('<|ACT {"motion":"motions/疑惑.motion3.json"}|>')
    expect(prompt).toContain('- "motions/疑惑.motion3.json"')
  })
})
