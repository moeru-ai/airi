import JSZip from 'jszip'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encodeArchivePathForFileLoader, encodeModelSettingsJsonPaths, isIgnoredPath, sanitizeModelSettingsJson, stringifyModelSettingsJsonForFileLoader } from './live2d-archive-paths'

describe('isIgnoredPath', () => {
  it('flags __MACOSX directory entries', () => {
    expect(isIgnoredPath('__MACOSX/model.model3.json')).toBe(true)
    expect(isIgnoredPath('dir/__MACOSX/file.moc3')).toBe(true)
    expect(isIgnoredPath('dir\\__MACOSX\\file.moc3')).toBe(true)
  })

  it('flags ._ Apple Double files', () => {
    expect(isIgnoredPath('._model.model3.json')).toBe(true)
    expect(isIgnoredPath('textures/._texture_00.png')).toBe(true)
    expect(isIgnoredPath('textures\\._texture_00.png')).toBe(true)
  })

  it('flags .DS_Store', () => {
    expect(isIgnoredPath('.DS_Store')).toBe(true)
    expect(isIgnoredPath('subdir/.DS_Store')).toBe(true)
  })

  it('flags Thumbs.db', () => {
    expect(isIgnoredPath('Thumbs.db')).toBe(true)
    expect(isIgnoredPath('assets/Thumbs.db')).toBe(true)
  })

  it('allows normal model paths', () => {
    expect(isIgnoredPath('model.model3.json')).toBe(false)
    expect(isIgnoredPath('textures/texture_00.png')).toBe(false)
    expect(isIgnoredPath('motions/idle.motion3.json')).toBe(false)
    expect(isIgnoredPath('physics/physics3.json')).toBe(false)
    expect(isIgnoredPath('model.moc3')).toBe(false)
  })
})

describe('sanitizeModelSettingsJson', () => {
  it('removes explicitly null Physics', () => {
    const json: Record<string, unknown> = {
      Version: 3,
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Physics: null,
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>)).not.toHaveProperty('Physics')
  })

  it('removes explicitly null Pose', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Pose: null,
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>)).not.toHaveProperty('Pose')
  })

  it('removes explicitly null DisplayInfo', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        DisplayInfo: null,
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>)).not.toHaveProperty('DisplayInfo')
  })

  it('keeps string Physics intact', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Physics: 'physics3.json',
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>).Physics).toBe('physics3.json')
  })

  it('filters motion entries with null File', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Motions: {
          idle: [
            { File: 'idle.motion3.json' },
            { File: null },
            { File: '' },
          ],
          tap: [
            { File: null },
          ],
        },
      },
    }
    sanitizeModelSettingsJson(json)
    const refs = json.FileReferences as Record<string, unknown>
    const motions = refs.Motions as Record<string, unknown>
    expect(motions.idle).toEqual([{ File: 'idle.motion3.json' }])
    expect(motions).not.toHaveProperty('tap')
  })

  it('removes Motions entirely when all groups are empty after filtering', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Motions: {
          idle: [{ File: null }],
        },
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>)).not.toHaveProperty('Motions')
  })

  it('filters expression entries with null File', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Expressions: [
          { File: 'happy.exp3.json', Name: 'happy' },
          { File: null, Name: 'broken' },
          { File: '', Name: 'empty' },
        ],
      },
    }
    sanitizeModelSettingsJson(json)
    const refs = json.FileReferences as Record<string, unknown>
    expect(refs.Expressions).toEqual([{ File: 'happy.exp3.json', Name: 'happy' }])
  })

  it('removes Expressions entirely when all entries are invalid', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Expressions: [{ File: null }],
      },
    }
    sanitizeModelSettingsJson(json)
    expect((json.FileReferences as Record<string, unknown>)).not.toHaveProperty('Expressions')
  })

  it('handles missing FileReferences gracefully', () => {
    const json: Record<string, unknown> = { Version: 3 }
    expect(() => sanitizeModelSettingsJson(json)).not.toThrow()
  })

  it('handles missing optional fields without error', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
      },
    }
    sanitizeModelSettingsJson(json)
    const refs = json.FileReferences as Record<string, unknown>
    expect(refs.Moc).toBe('model.moc3')
  })
})

describe('encodeModelSettingsJsonPaths', () => {
  it('encodes non-ASCII file references using the same form as FileLoader validation', () => {
    const json: Record<string, unknown> = {
      FileReferences: {
        Moc: '八千代辉夜姬.moc3',
        Textures: [
          '八千代辉夜姬.8192/texture_00.png',
          '八千代辉夜姬.8192/texture_01.png',
        ],
        Physics: '八千代辉夜姬.physics3.json',
      },
    }

    encodeModelSettingsJsonPaths(json)

    const refs = json.FileReferences as Record<string, unknown>
    expect(refs.Moc).toBe(encodeURI('八千代辉夜姬.moc3'))
    expect(refs.Textures).toEqual([
      encodeURI('八千代辉夜姬.8192/texture_00.png'),
      encodeURI('八千代辉夜姬.8192/texture_01.png'),
    ])
    expect(refs.Physics).toBe(encodeURI('八千代辉夜姬.physics3.json'))
  })

  it('keeps already encoded references stable', () => {
    const encoded = encodeURI('八千代辉夜姬.moc3')

    expect(encodeArchivePathForFileLoader(encoded)).toBe(encoded)
  })

  it('stringifies OPFS settings without double-encoding already normalized paths', () => {
    const encodedUrl = encodeURI('【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json')
    const encodedMoc = encodeURI('八千代辉夜姬.moc3')
    const encodedTexture = encodeURI('八千代辉夜姬.8192/texture_00.png')

    const text = stringifyModelSettingsJsonForFileLoader({
      url: encodedUrl,
      Version: 3,
      FileReferences: {
        Moc: encodedMoc,
        Textures: [encodedTexture],
      },
    })
    const json = JSON.parse(text)

    expect(json.url).toBe(encodedUrl)
    expect(json.FileReferences.Moc).toBe(encodedMoc)
    expect(json.FileReferences.Textures).toEqual([encodedTexture])
    expect(text).not.toContain('%25E5')
  })
})

describe('zipLoader integration: null Physics sanitization', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Live2DCubismCore: {} })
    vi.resetModules()
  })

  /**
   * Regression: model3.json with "Physics": null (explicit null, not absent)
   * caused the upstream replaceFiles() to pass null to url.resolve(), crashing
   * the import chain. Now readText sanitizes null to absent before upstream sees it.
   */
  it('produces settings with physics === undefined when model3.json has Physics: null', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('shisihangshi.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'shisihangshi.moc3',
        Textures: ['texture_00.png'],
        Physics: null,
      },
    }))

    const settings = await ZipLoader.createSettings(zip)

    expect(settings.physics).toBeUndefined()
  })

  /**
   * Regression: macOS zips may contain __MACOSX/._model.model3.json alongside
   * the real model.model3.json. The loader must ignore the junk entry.
   */
  it('ignores __MACOSX and ._ files when selecting settings file', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    // Junk first (would be selected first if not filtered)
    zip.file('__MACOSX/._model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'fake.moc3', Textures: ['fake.png'] },
    }))
    zip.file('model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'real.moc3', Textures: ['real.png'] },
    }))

    const settings = await ZipLoader.createSettings(zip)

    // Should pick the real settings file, not the macOS junk
    expect(settings.moc).toBe('real.moc3')
  })

  /**
   * Regression: FileLoader validates zip resources with encodeURI(webkitRelativePath).
   * Settings paths must be encoded to the same form, otherwise models with Chinese
   * file names parse successfully but fail during upload validation.
   */
  it('keeps non-ASCII model paths valid for FileLoader after unzip', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: '八千代辉夜姬.moc3',
        Textures: [
          '八千代辉夜姬.8192/texture_00.png',
          '八千代辉夜姬.8192/texture_01.png',
        ],
        Physics: '八千代辉夜姬.physics3.json',
      },
    }))
    zip.file('【雪熊企划】八千代辉夜姬/八千代辉夜姬.moc3', new Uint8Array(10))
    zip.file('【雪熊企划】八千代辉夜姬/八千代辉夜姬.physics3.json', '{}')
    zip.file('【雪熊企划】八千代辉夜姬/八千代辉夜姬.8192/texture_00.png', new Uint8Array(10))
    zip.file('【雪熊企划】八千代辉夜姬/八千代辉夜姬.8192/texture_01.png', new Uint8Array(10))

    const settings = await ZipLoader.createSettings(zip)
    const files = await ZipLoader.unzip(zip, settings)
    const encodedPaths = files.map(file => encodeURI(file.webkitRelativePath))

    expect(() => settings.validateFiles(encodedPaths)).not.toThrow()
  })

  /**
   * Regression: OPFS saveMiddleware reconstructs a settings file between ZipLoader
   * and FileLoader. It must persist the already-normalized settings without turning
   * `%E5...` paths into `%25E5...`, or FileLoader cannot validate resources.
   */
  it('keeps OPFS-reconstructed non-ASCII settings valid for FileLoader', async () => {
    const { Cubism4ModelSettings } = await import('pixi-live2d-display/cubism4')
    const modelDir = '【雪熊企划】八千代辉夜姬'
    const modelFile = '八千代辉夜姬.model3.json'
    const mocFile = '八千代辉夜姬.moc3'
    const textureFile = '八千代辉夜姬.8192/texture_00.png'
    const settingsJson = JSON.parse(stringifyModelSettingsJsonForFileLoader({
      url: encodeURI(`${modelDir}/${modelFile}`),
      Version: 3,
      FileReferences: {
        Moc: encodeURI(mocFile),
        Textures: [encodeURI(textureFile)],
      },
    }))

    const settings = new Cubism4ModelSettings(settingsJson)
    const encodedPaths = [
      `${modelDir}/${mocFile}`,
      `${modelDir}/${textureFile}`,
    ].map(path => encodeURI(path))

    expect(() => settings.validateFiles(encodedPaths)).not.toThrow()
  })
})
