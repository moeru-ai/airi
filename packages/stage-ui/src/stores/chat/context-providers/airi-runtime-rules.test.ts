import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it } from 'vitest'

import { createAiriRuntimeRulesContext } from './airi-runtime-rules'

describe('createAiriRuntimeRulesContext', () => {
  it('keeps emotion and emoji rules in one replaceable runtime context', () => {
    const context = createAiriRuntimeRulesContext({
      emotion: 'Start every reply with an ACT token.',
      emoji: 'Do not use emojis.',
    })

    expect(context).toMatchObject({
      contextId: 'system:airi-runtime-rules',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      metadata: {
        source: { id: 'system:airi-runtime-rules' },
      },
      text: 'Start every reply with an ACT token.\n\nDo not use emojis.',
    })
    expect(context.id).toEqual(expect.any(String))
    expect(context.createdAt).toEqual(expect.any(Number))
  })
})
