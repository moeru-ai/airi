import { describe, expect, it } from 'vitest'

import { extractVisibleReactionText } from './reaction-text'

describe('extractVisibleReactionText', () => {
  // https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 removes internal action and delay markers while preserving visible text', async () => {
    const response = '我看到你正在整理代码<|ACT {"emotion":{"name":"happy","intensity":1}}|><|DELAY:1|>继续加油'

    await expect(extractVisibleReactionText(response)).resolves.toBe('我看到你正在整理代码继续加油')
  })
})
