import { describe, expect, it } from 'vitest'

import { glyphFromSvgBody, iconGlyph, loadIconGlyphs } from './icon-glyphs'

describe('icon glyphs', () => {
  it('reads the fill and the stroke of each path', () => {
    expect(glyphFromSvgBody('<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4 10v4"/>')).toEqual({
      paths: [{ d: 'M4 10v4', fill: false, stroke: true, width: 2, cap: 'round' }],
    })
    // A path inside a group without fill does not fill, unless it sets its own fill.
    expect(glyphFromSvgBody('<g fill="none"><path d="M24 0v24H0V0z"/><path fill="currentColor" d="M1 1h2"/></g>')?.paths.map(path => path.fill)).toEqual([false, true])
    expect(glyphFromSvgBody('<circle cx="12" cy="12" r="4"/>')).toBeUndefined()
  })

  it('gives MingCute icons once they load, and nothing for other icon sets', async () => {
    expect(iconGlyph('i-mingcute:tool-line')).toBeUndefined()
    await loadIconGlyphs()
    expect(iconGlyph('i-mingcute:tool-line')?.paths[0]?.stroke).toBe(true)
    expect(iconGlyph('i-mingcute:not-an-icon')).toBeUndefined()
    expect(iconGlyph('i-solar:tool-line')).toBeUndefined()
  })
})
