import { describe, expect, it } from 'vitest'

import { composeRecipeSpacePrompt, composeSystemPrompt } from './prompt-recipe'

describe('chat prompt recipe', () => {
  // https://github.com/moeru-ai/airi/discussions/2239
  it('adds the AIRI chat math syntax before the identity', () => {
    const content = composeSystemPrompt('You are AIRI.')

    expect(content).toContain('Use $$...$$ for inline math.')
    expect(content).toContain('Use a separate multiline $$ block for each display equation.')
    expect(content).toContain('Use a latex fence for a list of independent one-line equations.')
    expect(content).toContain('Use a math fence for one multiline equation or LaTeX environment.')
    expect(content).toContain('Do not use single dollar signs as math delimiters.')
    expect(content).not.toContain('eg: $ x^3 $')
    expect(content.endsWith('You are AIRI.')).toBe(true)
  })
  // A recipe runs in its own session, so its steps join that session's prefix and never the conversation's.
  it('describes a task recipe space', () => {
    const recipe = { id: 'user:look', name: 'Look', description: '', instructions: 'Read the screen slot.', keywords: [], source: 'user' as const, enabled: true, approved: true }

    expect(composeRecipeSpacePrompt(recipe)).toContain('Your reply is the recipe\'s result')
    expect(composeRecipeSpacePrompt(recipe)).toContain('Recipe steps:\nRead the screen slot.')
    // The steps can leave each run to the model, so they come after the recipe's purpose.
    expect(composeRecipeSpacePrompt({ ...recipe, description: 'Checks on the owner late at night.' }))
      .toContain('Purpose: Checks on the owner late at night.\nRecipe steps:\nRead the screen slot.')
  })
})
