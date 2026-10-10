import { describe, expect, it } from 'vitest'

import { completeSpeechOverrides, getSpeechSelectionState, resolveSpeechOutputSelection } from './airi-card-modules'

const defaults = { provider: 'provider-a', model: 'model-a', voice_id: 'voice-a' }

describe('speech configuration helpers', () => {
  // https://github.com/moeru-ai/airi/issues/2861
  // ROOT CAUSE:
  // Comparing the raw empty provider to defaults freezes inherited voice fields.
  // Compare the resolved provider and preserve each inherited field independently.
  it.each([
    [{ provider: '', model: '', voice_id: '' }, defaults, { provider: '', model: '', voice_id: '' }],
    [{ provider: '', model: 'model-a', voice_id: '' }, defaults, { provider: '', model: 'model-a', voice_id: '' }],
    [{ provider: 'provider-a', model: '', voice_id: '' }, defaults, { provider: 'provider-a', model: '', voice_id: '' }],
    [{ provider: '', model: '', voice_id: 'custom' }, { ...defaults, voice_id: 'custom' }, { provider: '', model: '', voice_id: 'custom' }],
    [{ provider: 'provider-b', model: '', voice_id: '' }, { provider: 'provider-b', model: 'model-b', voice_id: 'voice-b' }, { provider: 'provider-b', model: 'model-b', voice_id: 'voice-b' }],
    [{ provider: '', model: 'model-b', voice_id: '' }, { ...defaults, model: 'model-b', voice_id: 'voice-b' }, { provider: '', model: 'model-b', voice_id: 'voice-b' }],
  ])('preserves field inheritance (Issue #2861): %j', (source, resolved, expected) => {
    expect(completeSpeechOverrides(source, defaults, resolved)).toEqual(expected)
  })

  it('uses provider fields only for missing selections', () => {
    expect(resolveSpeechOutputSelection({ provider: 'custom', model: '', voice_id: '' }, { model: 'configured-model', voice: 'configured-voice' }))
      .toEqual({ provider: 'custom', model: 'configured-model', voice_id: 'configured-voice' })
    expect(resolveSpeechOutputSelection(defaults, { model: 'other', voice: 'other' })).toEqual(defaults)
  })

  it('resolves the advertised streaming model without replacing an explicit qualified model', () => {
    const selection = { provider: 'official-provider-speech-streaming', model: 'short', voice_id: 'voice' }
    expect(resolveSpeechOutputSelection(selection, undefined, 'vendor/model').model).toBe('vendor/model')
    expect(resolveSpeechOutputSelection({ ...selection, model: 'custom/model' }, undefined, 'vendor/model').model).toBe('custom/model')
  })

  it.each([
    [{ provider: 'speech-noop', model: '', voice_id: '' }, 'muted'],
    [{ provider: '', model: '', voice_id: '' }, 'incomplete'],
    [{ ...defaults, voice_id: '' }, 'incomplete'],
    [{ provider: 'official-provider-speech-streaming', model: 'short', voice_id: 'voice' }, 'incomplete'],
    [defaults, 'ready'],
  ] as const)('reports configuration readiness for %j', (selection, state) => {
    expect(getSpeechSelectionState(selection)).toBe(state)
  })
})
