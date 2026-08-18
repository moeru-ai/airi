import { describe, expect, it } from 'vitest'

import { renderCallManifestPrompt } from './call'

describe('call parser prompt rendering', () => {
  /**
   * @example
   * renderCallManifestPrompt([{ name: 'plugin.action', prompt: 'Run it.' }])
   * // -> includes CALL syntax instructions and examples
   */
  it('renders CALL syntax instructions and manifest examples from the parser module', () => {
    const prompt = renderCallManifestPrompt([
      {
        name: 'plugin.action',
        prompt: 'Run the plugin action when the model is ready.',
      },
    ])

    expect(prompt).toContain('Available streaming CALL tokens')
    expect(prompt).toContain('Syntax: <|CALL ["call.name"]|>')
    expect(prompt).toContain('Never write provider tool names inside <|CALL ...|>')
    expect(prompt).toContain('plugin.action')
    expect(prompt).toContain('<|CALL ["plugin.action"]|>')
  })
})
