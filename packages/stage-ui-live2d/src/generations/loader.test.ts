import { describe, expect, it } from 'vitest'

import { selectLive2DSettings } from './loader'

describe('live2D generation settings selection', () => {
  it('selects valid Cubism 2 settings', () => {
    expect(selectLive2DSettings([{ path: 'model/model.model.json', json: { model: 'model.moc', textures: ['model.png'] } }]).loader.generation).toBe('cubism2')
  })

  it('selects valid Cubism 4 settings', () => {
    expect(selectLive2DSettings([{ path: 'model/model.model3.json', json: { FileReferences: { Moc: 'model.moc3', Textures: ['model.png'] } } }]).loader.generation).toBe('cubism4')
  })

  it('does not claim a settings-looking path with an incompatible body', () => {
    expect(() => selectLive2DSettings([{ path: 'unrelated.model.json', json: { message: 'hello' } }])).toThrow(/found 0/)
  })

  it('rejects multiple valid entry points', () => {
    expect(() => selectLive2DSettings([
      { path: 'legacy.model.json', json: { model: 'legacy.moc', textures: ['legacy.png'] } },
      { path: 'modern.model3.json', json: { FileReferences: { Moc: 'modern.moc3', Textures: ['modern.png'] } } },
    ])).toThrow(/found 2/)
  })
})
