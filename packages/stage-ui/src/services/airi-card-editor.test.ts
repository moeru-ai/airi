import type { Card } from '@proj-airi/ccc'

import type { AiriExtension } from '../types/airiCard'

import { describe, expect, it } from 'vitest'

import { applyAiriCardEditorModules, safeParseAiriCardDraft } from './airi-card-editor'

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
      description: '',
      name: '  ReLU Chan  ',
      personality: '',
      postHistoryInstructions: '',
      scenario: '',
      systemPrompt: '',
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
      error: 'name',
      success: false,
    })
    expect(safeParseAiriCardDraft({ ...createCard(), version: 'v1' }, '{}')).toEqual({
      error: 'version',
      success: false,
    })
    expect(safeParseAiriCardDraft(createCard(), '[]')).toEqual({
      error: 'invalid_artistry_json',
      success: false,
    })
    expect(safeParseAiriCardDraft(createCard(), '{')).toEqual({
      error: 'invalid_artistry_json',
      success: false,
    })
  })

  it('treats blank Artistry options as absent', () => {
    const result = safeParseAiriCardDraft(createCard(), '   ')

    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.output.artistryOptions).toBeUndefined()
  })

  it('preserves AIRI extension fields that are not editable in the form', () => {
    // ROOT CAUSE:
    //
    // Saving the editor rebuilt `extensions.airi.modules` from visible form
    // controls and reset `agents` to an empty object. Hidden settings such as
    // body models, backgrounds, advanced speech/artistry fields, and agent
    // prompts were therefore lost after an otherwise unrelated edit.
    //
    // We fix this by applying the editor-owned fields as a structured patch
    // over the existing extension.
    const existing: AiriExtension = {
      agents: {
        minecraft: { enabled: true, prompt: 'Keep building.' },
      },
      modules: {
        activeBackgroundId: 'background-1',
        artistry: {
          autonomousTarget: 'user',
          enabled: true,
          model: 'old-artistry-model',
          provider: 'old-artistry',
          workflowId: 'workflow-1',
        },
        consciousness: { model: 'old-chat-model', provider: 'old-chat' },
        displayModelId: 'old-display-model',
        live2d: { file: 'models/avatar.model3.json', source: 'file' },
        speech: {
          language: 'ja',
          model: 'old-speech-model',
          pitch: 1.2,
          provider: 'old-speech',
          rate: 0.9,
          ssml: true,
          voice_id: 'old-voice',
        },
        vision: { model: 'old-vision-model', provider: 'old-vision' },
        vrm: { source: 'url', url: 'https://example.com/avatar.vrm' },
      },
    }

    const result = applyAiriCardEditorModules({
      ...createCard(),
      extensions: {
        airi: {
          ...existing,
          futureRootField: { keep: true },
        },
        thirdParty: { keep: true },
      },
    }, {
      artistry: {
        autonomousEnabled: true,
        autonomousThreshold: 80,
        model: 'new-artistry-model',
        options: { steps: 12 },
        promptPrefix: 'portrait',
        provider: 'new-artistry',
        spawnMode: 'widget',
        widgetInstruction: 'Use the image widget.',
      },
      consciousness: { model: 'new-chat-model', provider: 'new-chat' },
      displayModelId: 'new-display-model',
      speech: { model: 'new-speech-model', provider: 'new-speech', voice_id: 'new-voice' },
      vision: { model: 'new-vision-model', provider: 'new-vision' },
    })

    const extension = result.extensions.airi

    expect(result.extensions.thirdParty).toEqual({ keep: true })
    expect(extension).toHaveProperty('futureRootField', { keep: true })
    expect(extension.modules.consciousness).toEqual({ model: 'new-chat-model', provider: 'new-chat' })
    expect(extension.modules.vision).toEqual({ model: 'new-vision-model', provider: 'new-vision' })
    expect(extension.modules.speech).toEqual({
      language: 'ja',
      model: 'new-speech-model',
      pitch: 1.2,
      provider: 'new-speech',
      rate: 0.9,
      ssml: true,
      voice_id: 'new-voice',
    })
    expect(extension.modules.vrm).toEqual(existing.modules.vrm)
    expect(extension.modules.live2d).toEqual(existing.modules.live2d)
    expect(extension.modules.displayModelId).toBe('new-display-model')
    expect(extension.modules.activeBackgroundId).toBe('background-1')
    expect(extension.modules.artistry).toEqual({
      autonomousEnabled: true,
      autonomousTarget: 'user',
      autonomousThreshold: 80,
      enabled: true,
      model: 'new-artistry-model',
      options: { steps: 12 },
      promptPrefix: 'portrait',
      provider: 'new-artistry',
      spawnMode: 'widget',
      widgetInstruction: 'Use the image widget.',
      workflowId: 'workflow-1',
    })
    expect(extension.agents).toEqual(existing.agents)
  })
})

function createCard(): Card {
  return {
    greetings: [],
    messageExample: [],
    name: 'ReLU',
    version: '1.0',
  }
}
