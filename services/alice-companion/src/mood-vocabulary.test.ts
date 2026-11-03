import { describe, expect, it } from 'vitest'

import { resolveMood } from './mood-vocabulary'

describe('resolveMood', () => {
  // The MagicMirror module `mapMood` drops these three moods to `neutral`.
  // The published state must keep them, because TalkingHead supports them.
  it.each(['love', 'fear', 'disgust'])('keeps the TalkingHead mood %s', (mood) => {
    expect(resolveMood(mood).talkingheadMood).toBe(mood)
  })

  it('projects the NeoAlice vocabulary', () => {
    expect(resolveMood('playful')).toEqual({ primary: 'playful', known: true, talkingheadMood: 'happy', airiEmotion: 'happy' })
    expect(resolveMood('tired')).toEqual({ primary: 'tired', known: true, talkingheadMood: 'sleep', airiEmotion: 'neutral' })
  })

  it('keeps AIRI emotions that TalkingHead does not have', () => {
    expect(resolveMood('curious')).toEqual({ primary: 'curious', known: true, talkingheadMood: 'neutral', airiEmotion: 'curious' })
  })

  it('normalizes case and spaces', () => {
    expect(resolveMood('  HAPPY ').primary).toBe('happy')
  })

  it('marks an unknown mood and projects it to neutral', () => {
    expect(resolveMood('melancholic')).toEqual({ primary: 'melancholic', known: false, talkingheadMood: 'neutral', airiEmotion: 'neutral' })
  })

  it('does not resolve object prototype keys as moods', () => {
    expect(resolveMood('constructor').known).toBe(false)
  })
})
