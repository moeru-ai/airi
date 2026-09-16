import { describe, expect, it } from 'vitest'

import { shouldForwardSignalToConscious } from './reflex-manager'

// The bot died against a kiting pillager because every incoming arrow woke the brain, which then
// `stop`ped its own in-flight attack (combat thrashing). While attacking, routine `damage` signals
// are now suppressed; critical health still reaches the brain via the separate `low_health` signal.

function sig(type: string, action?: string): any {
  return { type, metadata: action ? { action } : {} }
}

describe('shouldForwardSignalToConscious', () => {
  it('never forwards entity_attention (handled by reflex behaviors)', () => {
    expect(shouldForwardSignalToConscious(sig('entity_attention'), false)).toBe(false)
    expect(shouldForwardSignalToConscious(sig('entity_attention'), true)).toBe(false)
  })

  it('forwards damage when NOT attacking (normal hurt reaction)', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'damage'), false)).toBe(true)
  })

  it('suppresses damage WHILE attacking, to stop the brain cancelling its own attack', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'damage'), true)).toBe(false)
  })

  it('still forwards critical low_health while attacking, so it can choose to retreat', () => {
    expect(shouldForwardSignalToConscious(sig('saliency_high', 'low_health'), true)).toBe(true)
  })

  it('forwards chat and other signals regardless of combat', () => {
    expect(shouldForwardSignalToConscious(sig('chat_message'), true)).toBe(true)
    expect(shouldForwardSignalToConscious(sig('system_message'), true)).toBe(true)
  })
})
