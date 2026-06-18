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
