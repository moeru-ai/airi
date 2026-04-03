import { describe, expect, it } from 'vitest'

import { parseCaptureBrowserCliArguments } from './capture'

describe('parseCaptureBrowserCliArguments', () => {
  it('accepts a render entry and output dir', () => {
    expect(parseCaptureBrowserCliArguments([
      'src/scenes/intro.ts',
      '--output-dir',
      './artifacts/browser-run',
    ])).toEqual({
      renderEntry: 'src/scenes/intro.ts',
      outputDir: './artifacts/browser-run',
      rootNames: [],
    })
  })

  it('accepts the -o alias and repeated --root flags', () => {
    expect(parseCaptureBrowserCliArguments([
      'src/scenes/intro.ts',
      '-o',
      './artifacts/browser-run',
      '--root',
      'intro-desktop',
      '--root',
      'intro-settings',
    ])).toEqual({
      renderEntry: 'src/scenes/intro.ts',
      outputDir: './artifacts/browser-run',
      rootNames: ['intro-desktop', 'intro-settings'],
    })
  })

  it('rejects missing output dir', () => {
    expect(() => parseCaptureBrowserCliArguments([
      'src/scenes/intro.ts',
    ])).toThrow('Usage: vishot-runner-browser <render-entry> --output-dir <dir>')
  })

  it('rejects extra positional arguments', () => {
    expect(() => parseCaptureBrowserCliArguments([
      'src/scenes/intro.ts',
      'src/scenes/demo.ts',
      '--output-dir',
      './artifacts/browser-run',
    ])).toThrow('Usage: vishot-runner-browser <render-entry> --output-dir <dir>')
  })
})
