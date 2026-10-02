import { describe, expect, it } from 'vitest'

import { composeSystemPrompt } from './prompt-recipe'

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

  it('lists only instruction recipes with instructions', () => {
    const content = composeSystemPrompt('You are AIRI.', [
      { id: 'a', name: 'Game night', description: 'Starts a game.', style: { kind: 'instructions', instructions: 'Ask which game.' }, triggers: [], source: 'user', enabled: true, approved: true },
      { id: 'b', name: 'Quiet', description: 'Stays quiet.', style: { kind: 'instructions', instructions: '' }, triggers: [], source: 'builtin', enabled: true, approved: true },
      { id: 'c', name: 'Helper', description: 'Runs apart.', style: { kind: 'run', instructions: 'Work alone.' }, triggers: [], source: 'user', enabled: true, approved: true },
    ])

    expect(content).toContain('- Game night: Starts a game.\n  How: Ask which game.')
    expect(content).not.toContain('Quiet')
    expect(content).not.toContain('Helper')
  })
})
