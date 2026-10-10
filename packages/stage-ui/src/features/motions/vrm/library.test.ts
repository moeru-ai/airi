import { describe, expect, it } from 'vitest'

import { builtinMotions, createMotionPrompt, defaultMotionPreferences } from './library'

describe('motion prompt selection', () => {
  it('keeps default preferences independent for each avatar', () => {
    const first = defaultMotionPreferences()
    const second = defaultMotionPreferences()
    first.aiMotionIds.length = 0
    expect(second.aiMotionIds).toContain('bow')
    expect(second.idleId).toBe('default-idle')
  })

  it('restricts chat actions to eligible IDs from the current catalog', () => {
    const preferences = defaultMotionPreferences()
    preferences.aiMotionIds = ['bow', 'missing']
    const prompt = createMotionPrompt(preferences, builtinMotions)
    expect(prompt).toContain('"id":"bow"')
    expect(prompt).not.toContain('"id":"dance"')
    expect(prompt).not.toContain('"id":"missing"')
    expect(prompt).toContain('"stop"')
  })

  it('omits disabled motion instructions', () => {
    const preferences = defaultMotionPreferences()
    preferences.aiEnabled = false
    expect(createMotionPrompt(preferences, builtinMotions)).toBe('')
  })
})
