import type { VrmEmoteAnimation } from '../../assets/vrm/animations'

import { describe, expect, it } from 'vitest'

import { defaultVrmMotionLibrary } from '../../assets/vrm/animations'
import { findVrmEmote, vrmEmoteCue } from './emote-cue'

describe('findVrmEmote', () => {
  it('finds a bundled emote by id', () => {
    expect(findVrmEmote(defaultVrmMotionLibrary.emotes, 'greeting')?.id).toBe('greeting')
  })

  it('ignores case, spaces, hyphens, and underscores', () => {
    for (const cue of ['Peace Sign', 'peace-sign', ' PEACE_SIGN '])
      expect(findVrmEmote(defaultVrmMotionLibrary.emotes, cue)?.id).toBe('peace_sign')
  })

  it('matches the name of an imported emote', () => {
    const emotes: VrmEmoteAnimation[] = [{ id: 'vrma-1', name: 'Happy Jump', description: 'Jump with joy', url: 'blob:example' }]

    expect(findVrmEmote(emotes, 'happy jump')?.id).toBe('vrma-1')
  })

  it('returns nothing for an unknown or empty cue', () => {
    expect(findVrmEmote(defaultVrmMotionLibrary.emotes, 'backflip')).toBeUndefined()
    expect(findVrmEmote(defaultVrmMotionLibrary.emotes, '  ')).toBeUndefined()
  })

  it('gives each bundled emote its id as the cue, and the cue finds it again', () => {
    for (const emote of defaultVrmMotionLibrary.emotes) {
      expect(vrmEmoteCue(emote)).toBe(emote.id)
      expect(findVrmEmote(defaultVrmMotionLibrary.emotes, vrmEmoteCue(emote))).toBe(emote)
    }
  })
})
