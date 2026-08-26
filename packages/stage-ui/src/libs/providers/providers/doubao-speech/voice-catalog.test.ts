import { describe, expect, it } from 'vitest'

import {
  doubaoOfficialVoices,
  findDoubaoOfficialVoice,
  isDoubaoOfficialVoice,
} from './voice-catalog'

describe('doubao Speech 2.0 voice catalog', () => {
  it('contains the current official bidirectional voices', () => {
    expect(doubaoOfficialVoices).toHaveLength(429)
    expect(findDoubaoOfficialVoice('zh_female_vv_uranus_bigtts')).toMatchObject({
      catalog: 'standard',
      name: 'Vivi 2.0',
    })
    expect(findDoubaoOfficialVoice('ar_female_dina_uranus_bigtts')).toMatchObject({
      catalog: 'multilingual',
      name: 'Dina',
    })
  })

  it('keeps every voice_type unique', () => {
    const voiceIds = doubaoOfficialVoices.map(voice => voice.id)

    expect(new Set(voiceIds).size).toBe(voiceIds.length)
    expect(doubaoOfficialVoices.every(voice => voice.name && voice.scene && voice.languages)).toBe(true)
  })

  it('excludes legacy and single-direction-only voices', () => {
    expect(isDoubaoOfficialVoice('zh_female_shuangkuaisisi_moon_bigtts')).toBe(false)
    expect(isDoubaoOfficialVoice('de_male_sven_uranus_bigtts')).toBe(false)
    expect(isDoubaoOfficialVoice('en_female_natasha_uranus_bigtts')).toBe(false)
  })
})
