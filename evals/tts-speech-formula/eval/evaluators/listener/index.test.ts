import { describe, expect, it } from 'vitest'

import { listenerPrompt } from '.'

// Velin renders markdown and writes markdown back, which escapes backslashes, underscores, and braces in plain text.
// The prompts keep every LaTeX example in a code span, so the listener sees it unchanged.
describe('listenerPrompt', () => {
  it.each(['formula', 'chem', 'sentence'] as const)('keeps every LaTeX example unchanged for the %s form', async (form) => {
    const prompt = await listenerPrompt('zh', form)
    for (const example of [String.raw`\frac{B}{A}`, String.raw`\{x \mid ...\}`, String.raw`\sum_{k=1}^{n}`, String.raw`\sigma_0`, String.raw`7\,\mathrm{kg}`, String.raw`^\circ\mathrm{C}`])
      expect(prompt).toContain(`\`${example}\``)
    expect(prompt).not.toContain('<div')
    expect(prompt).toContain('Mandarin Chinese')
  })

  it('tells the listener only about the form of the audio', async () => {
    expect(await listenerPrompt('en', 'chem')).toContain(String.raw`\ce{...}`)
    expect(await listenerPrompt('en', 'sentence')).toContain(String.raw`\$19.99`)
    expect(await listenerPrompt('en', 'formula')).not.toContain(String.raw`\ce{...}`)
  })
})
