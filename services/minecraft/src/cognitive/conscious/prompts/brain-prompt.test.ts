import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateBrainSystemPrompt } from './brain-prompt'

describe('generateBrainSystemPrompt', () => {
  it('includes chat feedback loop guard guidance', () => {
    const prompt = generateBrainSystemPrompt([
      {
        name: 'chat',
        description: 'Send a chat message',
        execution: 'sync',
        schema: z.object({ message: z.string(), feedback: z.boolean().optional() }),
        perform: () => () => '',
      },
    ] as any)

    expect(prompt).toContain('Feedback Loop Guard')
    expect(prompt).toContain('chat->feedback->chat')
    expect(prompt).toContain('Query DSL')
    expect(prompt).toContain('Heuristic composition examples')
    expect(prompt).toContain('llmLog')
    expect(prompt).toContain('Silent-eval pattern')
    expect(prompt).toContain('Value-first rule')
    expect(prompt).toContain('forget_conversation()')
  })
})
