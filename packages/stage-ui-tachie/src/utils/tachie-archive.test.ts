import { describe, expect, it } from 'vitest'

import { resolveTachieArchiveLayout } from './tachie-archive'

describe('resolveTachieArchiveLayout', () => {
  it('maps root images case-insensitively while ignoring metadata', () => {
    const layout = resolveTachieArchiveLayout([
      'Neutral.PNG',
      'HAPPY.webp',
      '__MACOSX/._Neutral.PNG',
    ])

    expect(layout.errors).toEqual([])
    expect(layout.wrappingDirectory).toBeUndefined()
    expect(layout.entries).toEqual([
      { emotion: 'happy', path: 'HAPPY.webp' },
      { emotion: 'neutral', path: 'Neutral.PNG' },
    ])
    expect(layout.ignoredEntries).toEqual([])
  })

  it('accepts exactly one wrapping directory', () => {
    const layout = resolveTachieArchiveLayout([
      'Character/neutral.custom',
      'Character/surprised.avif',
      'Character/readme.txt',
      'license.txt',
    ])

    expect(layout.errors).toEqual([])
    expect(layout.wrappingDirectory).toBe('Character')
    expect(layout.entries).toEqual([
      { emotion: 'surprised', path: 'Character/surprised.avif' },
      { emotion: 'neutral', path: 'Character/neutral.custom' },
    ])
    expect(layout.ignoredEntries).toEqual(['Character/readme.txt', 'license.txt'])
  })

  it('rejects duplicate normalized emotion names', () => {
    const layout = resolveTachieArchiveLayout([
      'neutral.png',
      'Neutral.webp',
    ])

    expect(layout.errors).toEqual([
      'Emotion "neutral" is provided more than once: "neutral.png" and "Neutral.webp".',
    ])
  })

  it('rejects mixed root and wrapped emotion images', () => {
    const layout = resolveTachieArchiveLayout([
      'neutral.png',
      'Character/happy.png',
    ])

    expect(layout.errors).toContain('Emotion images cannot be mixed between the archive root and a wrapping directory.')
    expect(layout.errors).toContain('Emotion image "Character/happy.png" is nested; only root-level files are allowed.')
  })

  it('requires a neutral image', () => {
    const layout = resolveTachieArchiveLayout(['happy.png'])

    expect(layout.errors).toEqual(['Tachie archive must contain a neutral image.'])
  })

  it('rejects deeper arbitrary nesting', () => {
    const layout = resolveTachieArchiveLayout([
      'Character/images/neutral.png',
    ])

    expect(layout.errors).toContain('Emotion images must be stored at the archive root or inside one wrapping directory.')
  })
})
