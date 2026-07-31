import JSZip from 'jszip'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

function fileWithRelativePath(content: Blob | string | Uint8Array, name: string, webkitRelativePath: string): File {
  const fileContent = content instanceof Uint8Array ? blobFromBytes(content) : content
  const file = new File([fileContent], name)
  Object.defineProperty(file, 'webkitRelativePath', {
    value: webkitRelativePath,
  })
  return file
}

class TestFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  readAsText(file: File): void {
    void file.text()
      .then((text) => {
        this.result = text
        this.onload?.()
      })
      .catch(error => this.onerror?.(error))
  }
}

function createShisihangshiSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: '302301_shisihangshi.moc3',
      Textures: ['textures/302301_shisihangshi_00.png'],
      Physics: null,
      Motions: {
        '': [{ File: 'motions/t_idle.motion3.json' }],
      },
    },
    Groups: [],
  })
}

/** A Bestdori-packaged Cubism 2 entry point, as the `dori` archives ship it. */
function createDoriSettingsText(): string {
  return JSON.stringify({
    version: 'Sample 1.0.0',
    model: 'data/model.moc',
    textures: ['data/textures/texture_00.png', 'data/textures/texture_01.png'],
    motions: {
      idle: [{ file: 'data/motions/idle.mtn' }],
    },
  })
}

const appleDoubleHeader = new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0, 77, 97, 99, 32, 79, 83, 32, 88])

describe('live2d zip loader settings sanitization', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Live2DCubismCore: {} })
    vi.stubGlobal('FileReader', TestFileReader)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a zip model when model3.json contains Physics: null', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/302301_shisihangshi.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('302301_shisihangshi/textures/302301_shisihangshi_00.png', new Uint8Array([1, 2, 3]))
    zip.file('302301_shisihangshi/motions/t_idle.motion3.json', '{}')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = await ZipLoader.unzip(reader, settings)

    expect(settings.physics).toBeUndefined()
    expect(files.map(file => file.webkitRelativePath).sort()).toEqual([
      '302301_shisihangshi/302301_shisihangshi.moc3',
      '302301_shisihangshi/motions/t_idle.motion3.json',
      '302301_shisihangshi/textures/302301_shisihangshi_00.png',
    ])
  })

  it('loads a zip model when a macOS AppleDouble settings sidecar is present before the real settings file', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json', appleDoubleHeader)
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/302301_shisihangshi.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('302301_shisihangshi/textures/302301_shisihangshi_00.png', new Uint8Array([1, 2, 3]))
    zip.file('302301_shisihangshi/motions/t_idle.motion3.json', '{}')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const filePaths = await ZipLoader.getFilePaths(reader)

    expect(settings.url).toBe('302301_shisihangshi/302301_shisihangshi.model3.json')
    expect(settings.physics).toBeUndefined()
    expect(filePaths).not.toContain('__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json')
  })

  it('loads an OPFS-restored file directory when model3.json contains Physics: null', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { FileLoader } = runtime

    const files = [
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        '302301_shisihangshi.model3.json',
        '302301_shisihangshi/302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '302301_shisihangshi.moc3',
        '302301_shisihangshi/302301_shisihangshi.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        '302301_shisihangshi_00.png',
        '302301_shisihangshi/textures/302301_shisihangshi_00.png',
      ),
      fileWithRelativePath(
        '{}',
        't_idle.motion3.json',
        '302301_shisihangshi/motions/t_idle.motion3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.physics).toBeUndefined()
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('loads an OPFS-restored file directory when a macOS AppleDouble settings sidecar is present before the real settings file', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { FileLoader } = runtime

    const files = [
      fileWithRelativePath(
        appleDoubleHeader,
        '._302301_shisihangshi.model3.json',
        '__MACOSX/302301_shisihangshi/._302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        '302301_shisihangshi.model3.json',
        '302301_shisihangshi/302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '302301_shisihangshi.moc3',
        '302301_shisihangshi/302301_shisihangshi.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        '302301_shisihangshi_00.png',
        '302301_shisihangshi/textures/302301_shisihangshi_00.png',
      ),
      fileWithRelativePath(
        '{}',
        't_idle.motion3.json',
        '302301_shisihangshi/motions/t_idle.motion3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.url).toBe('302301_shisihangshi/302301_shisihangshi.model3.json')
    expect(settings.physics).toBeUndefined()
  })

  it('attaches expression metadata when settings come from an OPFS-restored file directory', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { FileLoader } = runtime

    const files = [
      fileWithRelativePath(
        createShisihangshiSettingsText(),
        '302301_shisihangshi.model3.json',
        '302301_shisihangshi/302301_shisihangshi.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '302301_shisihangshi.moc3',
        '302301_shisihangshi/302301_shisihangshi.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        '302301_shisihangshi_00.png',
        '302301_shisihangshi/textures/302301_shisihangshi_00.png',
      ),
      fileWithRelativePath(
        JSON.stringify({ Type: 'Live2D Expression', Parameters: [{ Id: 'ParamAngleX', Value: 30 }] }),
        'happy.exp3.json',
        '302301_shisihangshi/expressions/happy.exp3.json',
      ),
    ]

    // ROOT CAUSE:
    //
    // OPFSCache.checkMiddleware serves every cached model as File[], so only the
    // very first load of a model runs through ZipLoader. FileLoader.createSettings
    // never attached _expFiles, leaving expression metadata undefined from the
    // second load onwards.
    //
    // We fixed this by running collectDirectoryMetadata on the File[] path so both
    // loaders produce the same { name, fileName, data } shape.
    const settings = await FileLoader.createSettings(files)
    const { _expFiles: expressionFiles } = settings as typeof settings & {
      _expFiles?: Array<{ name: string, fileName: string, data: unknown }>
    }

    expect(expressionFiles).toHaveLength(1)
    expect(expressionFiles?.[0].name).toBe('happy')
    expect(expressionFiles?.[0].fileName).toBe('302301_shisihangshi/expressions/happy.exp3.json')
    expect(expressionFiles?.[0].data).toEqual({
      Type: 'Live2D Expression',
      Parameters: [{ Id: 'ParamAngleX', Value: 30 }],
    })
  })

  it('imports a zip model whose archive carries an unparseable expression file', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/302301_shisihangshi.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('302301_shisihangshi/textures/302301_shisihangshi_00.png', new Uint8Array([1, 2, 3]))
    zip.file(
      '302301_shisihangshi/expressions/happy.exp3.json',
      JSON.stringify({ Type: 'Live2D Expression', Parameters: [{ Id: 'ParamAngleX', Value: 30 }] }),
    )
    zip.file('302301_shisihangshi/expressions/truncated.exp.json', '{ "params": [')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())

    // ROOT CAUSE:
    //
    // Metadata collection parsed every expression file inside one Promise.all:
    //
    //   metadataSettings._expFiles = await Promise.all(paths.map(async fileName => ({
    //     data: JSON.parse(await reader.file(fileName)!.async('text')),
    //   })))
    //
    // A single malformed or stray sidecar therefore rejected createSettings and
    // failed the whole import, even though the manifest and render assets were
    // valid and expressions are optional. The metadata pass this replaced caught
    // the error and only lost the metadata.
    //
    // We fixed this by parsing each file on its own and dropping the ones that
    // throw, so the readable expressions still reach _expFiles.
    const settings = await ZipLoader.createSettings(reader)
    const { _expFiles: expressionFiles } = settings as typeof settings & {
      _expFiles?: Array<{ name: string, fileName: string, data: unknown }>
    }

    expect(settings.url).toBe('302301_shisihangshi/302301_shisihangshi.model3.json')
    expect(expressionFiles).toHaveLength(1)
    expect(expressionFiles?.[0].name).toBe('happy')
    expect(expressionFiles?.[0].fileName).toBe('302301_shisihangshi/expressions/happy.exp3.json')
  })

  // Pins the invariant `validateLive2DZip` relies on after dropping its
  // basename-collision rule: entries are addressed by full archive path, so two
  // files sharing a basename never overwrite one another.
  it('keeps two same-basename entries distinct', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('m/m.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'm.moc3',
        Textures: ['a/tex.png', 'b/tex.png'],
      },
    }))
    zip.file('m/m.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('m/a/tex.png', new Uint8Array([1, 1, 1]))
    zip.file('m/b/tex.png', new Uint8Array([2, 2]))

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = await ZipLoader.unzip(reader, settings)

    expect(files.map(file => file.webkitRelativePath).sort()).toEqual([
      'm/a/tex.png',
      'm/b/tex.png',
      'm/m.moc3',
    ])
    // Distinct byte lengths: proves each path carries its own payload rather
    // than one having overwritten the other under a shared basename.
    const textures = files.filter(file => file.webkitRelativePath.endsWith('tex.png'))
    expect(await textures.find(file => file.webkitRelativePath === 'm/a/tex.png')!.arrayBuffer()).toHaveProperty('byteLength', 3)
    expect(await textures.find(file => file.webkitRelativePath === 'm/b/tex.png')!.arrayBuffer()).toHaveProperty('byteLength', 2)
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('reports how to supply the Cubism 2 core when a legacy model.json reaches a Cubism 3+ only build', async () => {
    const runtime = await import('pixi-live2d-display/cubism4')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('kasumi_casual/model.json', createDoriSettingsText())
    zip.file('kasumi_casual/data/model.moc', new Uint8Array([109, 111, 99, 32]))
    zip.file('kasumi_casual/data/textures/texture_00.png', new Uint8Array([1, 2, 3]))
    zip.file('kasumi_casual/data/textures/texture_01.png', new Uint8Array([4, 5, 6]))
    zip.file('kasumi_casual/data/motions/idle.mtn', '$fps=30')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())

    // ROOT CAUSE:
    //
    // Live2DFactory.findRuntime returns undefined for a Cubism 2 model.json when
    // only the Cubism 4 runtime is registered, and the loader reported that as
    // 'Unknown Live2D settings JSON.' — indistinguishable from corrupt JSON, and
    // the only symptom the 103 dori archives produced.
    //
    // We fixed this by classifying the settings shape with upstream's own
    // Cubism2ModelSettings.isValidJSON predicate before falling back.
    const thrown = await ZipLoader.createSettings(reader).catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Error)
    // Asserted verbatim: the settings validation UI renders the same guidance.
    expect((thrown as Error).message).toBe(
      'Cubism 2 model "kasumi_casual/model.json" needs the proprietary live2d.min.js core, '
      + 'which is not present in this build. '
      + 'It is normally downloaded when AIRI is built, so check the build log for the reason it was skipped, '
      + 'or supply your own copy at packages/stage-ui-live2d/.cubism2/live2d.min.js or through AIRI_CUBISM2_CORE_PATH.',
    )
    expect((thrown as Error).message).not.toBe('Unknown Live2D settings JSON.')
  })
})

// NOTICE:
// The combined `pixi-live2d-display` bundle asserts both Cubism cores at module
// evaluation time and immediately patches the Cubism 2 core's globals, so it
// cannot be imported at all without a core present.
//
// Root cause: `dist/index.es.js:1549` throws on a missing `window.Live2D`, then
// line 1552 reads `Live2DMotion.prototype.updateParam`, line 1560 declares
// `class Live2DExpression extends AMotion`, and lines 1949-1956 read
// `PhysicsHair.Src.*` — all at module scope. The real `live2d.min.js` supplying
// those globals is proprietary and is never committed or downloaded, so these
// stubs stand in for the load-bearing surface the bundle touches during import.
// They are never called: this suite only exercises settings parsing.
//
// Removal condition: pixi-live2d-display (0.4.0 today) stops requiring the
// Cubism 2 core at module scope, or AIRI can ship a redistributable core.
class Cubism2CoreStub {
  static Src = { SRC_TO_X: 0, SRC_TO_Y: 1, SRC_TO_G_ANGLE: 2 }
  updateParam(): void {}
  setFadeIn(): void {}
  setFadeOut(): void {}
}

describe('live2d zip loader with the combined cubism 2 and cubism 4 runtime', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Live2D: {}, Live2DCubismCore: {} })
    vi.stubGlobal('AMotion', Cubism2CoreStub)
    vi.stubGlobal('Live2DMotion', Cubism2CoreStub)
    vi.stubGlobal('PhysicsHair', Cubism2CoreStub)
    vi.stubGlobal('FileReader', TestFileReader)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads a dori-style Cubism 2 model.json as Cubism2ModelSettings', async () => {
    const runtime = await import('pixi-live2d-display')
    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)
    const { Cubism2ModelSettings, ZipLoader } = runtime

    const zip = new JSZip()
    zip.file('kasumi_casual/model.json', createDoriSettingsText())
    zip.file('kasumi_casual/data/model.moc', new Uint8Array([109, 111, 99, 32]))
    zip.file('kasumi_casual/data/textures/texture_00.png', new Uint8Array([1, 2, 3]))
    zip.file('kasumi_casual/data/textures/texture_01.png', new Uint8Array([4, 5, 6]))
    zip.file('kasumi_casual/data/motions/idle.mtn', '$fps=30')

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)

    expect(settings).toBeInstanceOf(Cubism2ModelSettings)
    expect((settings as InstanceType<typeof Cubism2ModelSettings>).moc).toBe('data/model.moc')
    expect(settings.textures).toHaveLength(2)
    expect(settings.url).toBe('kasumi_casual/model.json')
  })
})
