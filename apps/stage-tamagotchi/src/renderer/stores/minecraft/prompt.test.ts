import { describe, expect, it } from 'vitest'

import { buildMinecraftToolsetPrompt, parseMasterUsername, shouldReadAloud } from './prompt'

/** @example describe('shouldReadAloud', () => {}) */
describe('shouldReadAloud', () => {
  /** @example it('reads a user-facing report headline', () => {}) */
  it('reads a user-facing report headline', () => {
    // @example
    expect(shouldReadAloud('I am being attacked by dssadg')).toBe(true)
  })

  /** @example it('reads a mixed status headline', () => {}) */
  it('reads a mixed status headline', () => {
    // @example
    expect(shouldReadAloud('HP 5/20, retreating now')).toBe(true)
  })

  /** @example it('does not read diagnostics or debug-only lines', () => {}) */
  it('does not read diagnostics or debug-only lines', () => {
    // @example
    expect(shouldReadAloud('Cannot complete task: missing iron_ingot x3')).toBe(false)
    // @example
    expect(shouldReadAloud('[debug] path_stop reason=interrupted')).toBe(false)
    // @example
    expect(shouldReadAloud('path_stop reason=interrupted')).toBe(false)
  })

  /** @example it('does not read empty or missing text', () => {}) */
  it('does not read empty or missing text', () => {
    // @example
    expect(shouldReadAloud('')).toBe(false)
    // @example
    expect(shouldReadAloud(undefined)).toBe(false)
    // @example
    expect(shouldReadAloud(null)).toBe(false)
  })
})

/** @example describe('parseMasterUsername', () => {}) */
describe('parseMasterUsername', () => {
  // The bot service surfaces its owner only in neutral status TEXT (no machine `master:` hint); the
  // adapter extracts it from there. This is the desktop-side replacement for the removed coupling.
  /** @example it('extracts the master username from the status text', () => {}) */
  it('extracts the master username from the status text', () => {
    const statusText = [
      'Bot online: Airi',
      'Server: 127.0.0.1:25565',
      'Health: 20/20, Mode: survival',
      'Master (your owner) in-game username: dssadg',
    ].join('\n')
    // @example
    expect(parseMasterUsername(statusText)).toBe('dssadg')
  })

  /** @example it('returns empty string when no master line is present', () => {}) */
  it('returns empty string when no master line is present', () => {
    // @example
    expect(parseMasterUsername('Bot online: Airi\nHealth: 20/20')).toBe('')
  })

  /** @example it('returns empty string for missing text', () => {}) */
  it('returns empty string for missing text', () => {
    // @example
    expect(parseMasterUsername('')).toBe('')
    // @example
    expect(parseMasterUsername(undefined)).toBe('')
    // @example
    expect(parseMasterUsername(null)).toBe('')
  })
})

/** @example describe('buildMinecraftToolsetPrompt', () => {}) */
describe('buildMinecraftToolsetPrompt', () => {
  /** @example it('activates relay mode and binds the master when online with a known master', () => {}) */
  it('activates relay mode and binds the master when online with a known master', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: true,
      masterUsername: 'dssadg',
      runtimeContextText: 'HP 20/20',
    })
    // @example
    expect(prompt).toContain('Minecraft online command mode active')
    // @example
    expect(prompt).toContain('relayToMinecraft')
    // @example
    expect(prompt).toContain('Owner identity binding')
    // @example
    expect(prompt).toContain('dssadg')
    // @example
    expect(prompt).toContain('HP 20/20')
  })

  /** @example it('omits the master binding when no master username is known', () => {}) */
  it('omits the master binding when no master username is known', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: true,
      masterUsername: '',
      runtimeContextText: '',
    })
    // @example
    expect(prompt).toContain('relayToMinecraft')
    // @example
    expect(prompt).not.toContain('Owner identity binding')
  })

  /** @example it('uses offline copy when the bot is not connected', () => {}) */
  it('uses offline copy when the bot is not connected', () => {
    const prompt = buildMinecraftToolsetPrompt({
      online: false,
      masterUsername: 'dssadg',
      runtimeContextText: '',
    })
    // @example
    expect(prompt).toContain('currently offline')
    // @example
    expect(prompt).not.toContain('Minecraft online command mode active')
    // Master binding still applies offline so the persona never treats the owner as a stranger.
    // @example
    expect(prompt).toContain('dssadg')
  })
})
