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

function createNonAsciiSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: '模型文件.moc3',
      Textures: ['模型贴图.4096/texture_00.png'],
      Physics: '模型文件.physics3.json',
      DisplayInfo: '模型文件.cdi3.json',
    },
    Groups: [],
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
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

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
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

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
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

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

  it('loads an OPFS-restored file directory when model3.json references non-ASCII file names', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        createNonAsciiSettingsText(),
        '模型文件.model3.json',
        '非ASCII模型26045/模型文件.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '模型文件.moc3',
        '非ASCII模型26045/模型文件.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        'texture_00.png',
        '非ASCII模型26045/模型贴图.4096/texture_00.png',
      ),
      fileWithRelativePath(
        '{}',
        '模型文件.physics3.json',
        '非ASCII模型26045/模型文件.physics3.json',
      ),
      fileWithRelativePath(
        '{}',
        '模型文件.cdi3.json',
        '非ASCII模型26045/模型文件.cdi3.json',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    // ROOT CAUSE:
    //
    // pixi-live2d-display validates OPFS-restored File objects against
    // encodeURI(file.webkitRelativePath), but the settings created from the
    // original model3.json currently keep non-ASCII file references unencoded.
    //
    // Before the fix, the settings expect "模型文件.moc3" while the available
    // file list contains URI-encoded non-ASCII directory paths, so validation
    // reports that the moc3 file does not exist.
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('does not double encode existing URI-encoded model3.json file references', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        JSON.stringify({
          Version: 3,
          FileReferences: {
            Moc: '%E6%A8%A1%E5%9E%8B%E6%96%87%E4%BB%B6.moc3',
            Textures: ['%E6%A8%A1%E5%9E%8B%E8%B4%B4%E5%9B%BE.4096/texture_00.png'],
          },
          Groups: [],
        }),
        '模型文件.model3.json',
        '非ASCII模型26045/模型文件.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '模型文件.moc3',
        '非ASCII模型26045/模型文件.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        'texture_00.png',
        '非ASCII模型26045/模型贴图.4096/texture_00.png',
      ),
    ]

    const settings = await FileLoader.createSettings(files)

    expect(settings.moc).toBe('%E6%A8%A1%E5%9E%8B%E6%96%87%E4%BB%B6.moc3')
    expect(settings.textures).toEqual(['%E6%A8%A1%E5%9E%8B%E8%B4%B4%E5%9B%BE.4096/texture_00.png'])
    expect(settings.moc).not.toContain('%25E6')
    expect(() => settings.validateFiles(files.map(file => encodeURI(file.webkitRelativePath)))).not.toThrow()
  })

  it('loads an OPFS-restored file directory when a macOS AppleDouble settings sidecar is present before the real settings file', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader } = await import('pixi-live2d-display/cubism4')

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
})
