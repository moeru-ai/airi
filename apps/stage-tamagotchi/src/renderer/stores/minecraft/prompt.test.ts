import { describe, expect, it } from 'vitest'

import { buildMinecraftToolsetPrompt, parseMasterUsername, shouldReadAloud } from './prompt'

describe('shouldReadAloud', () => {
  it('reads a user-facing report headline', () => {
    expect(shouldReadAloud('I am being attacked by dssadg')).toBe(true)
  })

  it('reads a mixed status headline', () => {
    expect(shouldReadAloud('HP 5/20, retreating now')).toBe(true)
  })

  it('does not read diagnostics or debug-only lines', () => {
    expect(shouldReadAloud('Cannot complete task: missing iron_ingot x3')).toBe(false)
    expect(shouldReadAloud('[debug] path_stop reason=interrupted')).toBe(false)
    expect(shouldReadAloud('path_stop reason=interrupted')).toBe(false)
  })

  it('does not read empty or missing text', () => {
    expect(shouldReadAloud('')).toBe(false)
    expect(shouldReadAloud(undefined)).toBe(false)
    expect(shouldReadAloud(null)).toBe(false)
  })
})

describe('parseMasterUsername', () => {
  // The bot service surfaces its owner only in neutral status TEXT (no machine `master:` hint); the
  // adapter extracts it from there. This is the desktop-side replacement for the removed coupling.
  it('extracts the master username from the status text', () => {
    const statusText = [
      'Bot online: Airi',
      'Server: 127.0.0.1:25565',
      'Health: 20/20, Mode: survival',
      'Master (your owner) in-game username: dssadg',
    ].join('\n')
    expect(parseMasterUsername(statusText)).toBe('dssadg')
  })

  it('returns empty string when no master line is present', () => {
    expect(parseMasterUsername('Bot online: Airi\nHealth: 20/20')).toBe('')
  })

  it('returns empty string for missing text', () => {
    expect(parseMasterUsername('')).toBe('')
    expect(parseMasterUsername(undefined)).toBe('')
    expect(parseMasterUsername(null)).toBe('')
  })
})

describe('buildMinecraftToolsetPrompt', () => {
  it('activates relay mode and binds the master when online with a known master', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: true,
      masterUsername: 'dssadg',
      runtimeContextText: 'HP 20/20',
    })
    expect(prompt).toContain('Minecraft online command mode active')
    expect(prompt).toContain('relayToMinecraft')
    expect(prompt).toContain('Owner identity binding')
    expect(prompt).toContain('dssadg')
    expect(prompt).toContain('HP 20/20')
  })

  it('omits the master binding when no master username is known', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: true,
      masterUsername: '',
      runtimeContextText: '',
    })
    expect(prompt).toContain('relayToMinecraft')
    expect(prompt).not.toContain('Owner identity binding')
  })

  it('uses offline copy when the bot is not connected', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: false,
      masterUsername: 'dssadg',
      runtimeContextText: '',
    })
    expect(prompt).toContain('currently offline')
    expect(prompt).not.toContain('Minecraft online command mode active')
    // Master binding still applies offline so the persona never treats the owner as a stranger.
    expect(prompt).toContain('dssadg')
  })
})
