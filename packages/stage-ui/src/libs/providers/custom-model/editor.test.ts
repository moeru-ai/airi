import { describe, expect, it } from 'vitest'

import { CustomModelConfigError } from './config'
import {
  addCustomModelDraftModel,
  applyCustomModelProtocolChange,
  applyDiscoveredCustomModels,
  createCustomModelEditorDraft,
  customModelBrowserBlockedPresentation,
  customModelDraftToConnectionInput,
  customModelModelsFromConfig,
  isCustomModelDefinitionId,
  partitionDiscoveredCustomModels,
  previewCustomModelUrls,
  redactCustomModelErrorText,
  snapshotCustomModelConnection,
  validateCustomModelEditorDraft,
} from './editor'

function validDraft() {
  return createCustomModelEditorDraft({
    name: 'OpenCode Go',
    config: {
      protocol: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1',
      generationPath: 'chat/completions',
      modelListPath: 'models',
      auth: { type: 'bearer', secret: 'sk-live' },
      headers: { 'X-Token': 'secret-header' },
      models: [{ id: 'hand-filled' }],
    },
  })
}

describe('custom model editor helpers', () => {
  it('identifies the Custom Model definition', () => {
    expect(isCustomModelDefinitionId('custom-model')).toBe(true)
    expect(isCustomModelDefinitionId('openai')).toBe(false)
  })

  it('keeps user model IDs when discovery succeeds, fails, is empty, or is unsupported', () => {
    const userModels = [{ id: 'hand-filled' }]

    expect(partitionDiscoveredCustomModels(userModels, [
      { id: 'hand-filled', name: 'Listed' },
      { id: 'discovered' },
    ])).toEqual({
      alreadySaved: [{ id: 'hand-filled', name: 'Listed' }],
      newModels: [{ id: 'discovered' }],
    })
    expect(partitionDiscoveredCustomModels(userModels, [])).toEqual({
      alreadySaved: [],
      newModels: [],
    })
    expect(addCustomModelDraftModel(
      [{ id: 'hand-filled', name: '' }],
      { id: 'discovered', name: 'Discovered' },
    )).toEqual([
      { id: 'hand-filled', name: '' },
      { id: 'discovered', name: 'Discovered' },
    ])
  })

  it('fills the draft model list from discovery and keeps hand-filled IDs', () => {
    const emptyDraft = createCustomModelEditorDraft({
      name: 'OpenCode Go',
      config: {
        protocol: 'openai-chat-completions',
        baseUrl: 'https://opencode.ai/zen/go/v1',
      },
    })
    const filled = applyDiscoveredCustomModels(emptyDraft, [
      { id: 'opencode/grok-code', name: 'Grok' },
      { id: 'opencode/minimax' },
    ])

    expect(filled.models).toEqual([
      { id: 'opencode/grok-code', name: 'Grok' },
      { id: 'opencode/minimax', name: '' },
    ])
    expect(filled.selectedModelId).toBe('opencode/grok-code')

    const merged = applyDiscoveredCustomModels(validDraft(), [
      { id: 'hand-filled', name: 'Listed' },
      { id: 'discovered' },
    ])
    expect(merged.models).toEqual([
      { id: 'hand-filled', name: 'Listed' },
      { id: 'discovered', name: '' },
    ])
    expect(merged.selectedModelId).toBe('hand-filled')
  })

  it('does not replace user model IDs when the protocol changes', () => {
    const next = applyCustomModelProtocolChange(validDraft(), 'openai-responses')

    expect(next.protocol).toBe('openai-responses')
    expect(next.generationPath).toBe('responses')
    expect(next.models).toEqual([{ id: 'hand-filled', name: '' }])
  })

  // ROOT CAUSE:
  //
  // createCustomModelEditorDraft defaulted generationPath from the protocol,
  // but copied modelListPath with asString only. A new connection has no
  // config.modelListPath, so the draft stored ''. The field showed the
  // placeholder "models". Discovery then treated a missing model-list URL as
  // unsupported and never sent GET /models.
  //
  // We fixed this by using the protocol default model-list path when the
  // saved config does not include one.
  it('uses the protocol default model-list path for a new connection draft', () => {
    const draft = createCustomModelEditorDraft({
      name: 'OpenCode Go',
      config: {},
    })

    expect(draft.generationPath).toBe('chat/completions')
    expect(draft.modelListPath).toBe('models')
    expect(previewCustomModelUrls({
      baseUrl: 'https://example.invalid/v1',
      generationPath: draft.generationPath,
      modelListPath: draft.modelListPath,
    }).modelListUrl).toBe('https://example.invalid/v1/models')
  })

  it('keeps an explicit empty model-list path from a saved connection', () => {
    const draft = createCustomModelEditorDraft({
      name: 'OpenCode Go',
      config: {
        protocol: 'openai-chat-completions',
        modelListPath: '',
      },
    })

    expect(draft.modelListPath).toBe('')
  })

  it('previews the final generation URL and keeps the Base URL path', () => {
    expect(previewCustomModelUrls({
      baseUrl: 'https://example.com/gateway/v1',
      generationPath: 'responses',
      modelListPath: 'models',
    })).toEqual({
      generationUrl: 'https://example.com/gateway/v1/responses',
      modelListUrl: 'https://example.com/gateway/v1/models',
    })
  })

  it('requires an explicit valid snapshot before persistence', () => {
    const draft = validDraft()
    draft.models = [{ id: '', name: '' }]

    expect(validateCustomModelEditorDraft(draft)).toEqual({
      success: false,
      code: 'model-required',
      field: 'models',
    })
    expect(() => snapshotCustomModelConnection(customModelDraftToConnectionInput(draft)))
      .toThrow(CustomModelConfigError)
  })

  it('validates an OpenCode Go draft for discovery before a model ID exists', () => {
    const draft = createCustomModelEditorDraft({
      name: 'OpenCode Go',
      config: {
        protocol: 'openai-chat-completions',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        generationPath: 'chat/completions',
        modelListPath: 'models',
        auth: { type: 'bearer', secret: 'sk-live' },
        headers: {},
      },
    })

    expect(validateCustomModelEditorDraft(draft).success).toBe(false)
    expect(validateCustomModelEditorDraft(draft, { requireModels: false })).toMatchObject({
      success: true,
      output: {
        baseUrl: 'https://opencode.ai/zen/go/v1/',
        models: [],
      },
    })
  })

  it('redacts secrets in error text and lists CORS, network, and TLS causes', () => {
    expect(redactCustomModelErrorText('Bearer sk-live failed')).toContain('[redacted]')
    expect(redactCustomModelErrorText('Bearer sk-live failed')).not.toContain('sk-live')
    expect(customModelBrowserBlockedPresentation().causes).toEqual(['cors', 'network', 'tls'])
  })

  it('reads saved models from a stored config object', () => {
    expect(customModelModelsFromConfig({
      models: [{ id: 'gpt-test' }, { id: 'gpt-test' }, { id: '' }, { id: 'other', name: 'Other' }],
    })).toEqual([
      { id: 'gpt-test' },
      { id: 'other', name: 'Other' },
    ])
  })
})
