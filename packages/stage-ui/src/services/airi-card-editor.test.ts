import type { Card } from '@proj-airi/ccc'

import { describe, expect, it } from 'vitest'

import { safeParseAiriCardDraft } from './airi-card-editor'

describe('airi card editor validation', () => {
  // https://github.com/moeru-ai/airi/issues/2108
  it('preserves display text and accepts optional empty fields for Issue #2108', () => {
    // ROOT CAUSE:
    //
    // The creation dialog normalized every input event and treated optional
    // CCv3 text fields as required. Multi-word names were rewritten while
    // otherwise valid minimal cards could not be saved.
    //
    // We fixed this by preserving draft input and normalizing only required
    // boundary fields through the shared Valibot schema.
    const result = safeParseAiriCardDraft({
      ...createCard(),
      name: '  ReLU Chan  ',
      description: '',
      personality: '',
      scenario: '',
      systemPrompt: '',
      postHistoryInstructions: '',
    }, '{ "steps": 12 }')

    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.output.card.name).toBe('ReLU Chan')
    expect(result.output.card.description).toBe('')
    expect(result.output.card.personality).toBe('')
    expect(result.output.card.scenario).toBe('')
    expect(result.output.card.systemPrompt).toBe('')
    expect(result.output.card.postHistoryInstructions).toBe('')
    expect(result.output.artistryOptions).toEqual({ steps: 12 })
  })

  // https://github.com/moeru-ai/airi/issues/2108
  it('rejects invalid required fields and Artistry JSON for Issue #2108', () => {
    expect(safeParseAiriCardDraft({ ...createCard(), name: '   ' }, '{}')).toEqual({
      success: false,
      error: 'name',
    })
    expect(safeParseAiriCardDraft({ ...createCard(), version: 'v1' }, '{}')).toEqual({
      success: false,
      error: 'version',
    })
    expect(safeParseAiriCardDraft(createCard(), '[]')).toEqual({
      success: false,
      error: 'invalid_artistry_json',
    })
    expect(safeParseAiriCardDraft(createCard(), '{')).toEqual({
      success: false,
      error: 'invalid_artistry_json',
    })
  })

  it('treats blank Artistry options as absent', () => {
    const result = safeParseAiriCardDraft(createCard(), '   ')

    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.output.artistryOptions).toBeUndefined()
  })
})

function createCard(): Card {
  return {
    name: 'ReLU',
    version: '1.0',
    greetings: [],
    messageExample: [],
  }
}
