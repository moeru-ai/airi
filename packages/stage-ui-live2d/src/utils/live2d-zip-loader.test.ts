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

function createCjkPathSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: '测试角色.moc3',
      Textures: ['中文纹理/texture_00.png'],
    },
    Groups: [],
  })
}

function createSpacePathSettingsText(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: 'Avatar Model.moc3',
      Textures: ['Avatar Model.4096/texture 00.png'],
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

  it('loads a zip model whose settings and resources use CJK paths', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader, Live2DModel, ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('中文路径模型/测试角色.model3.json', createCjkPathSettingsText())
    zip.file('中文路径模型/测试角色.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('中文路径模型/中文纹理/texture_00.png', new Uint8Array([1, 2, 3]))

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = Object.assign(await ZipLoader.unzip(reader, settings), { settings })
    const objectUrl = `zip://test/${settings.url}`
    Object.assign(settings, { _objectURL: objectUrl })

    // ROOT CAUSE:
    //
    // FileLoader encoded each webkitRelativePath before comparing it with settings.resolveURL().
    // CJK names therefore became percent-encoded on only one side of the comparison.
    //
    // settings.resolveURL('测试角色.moc3') !== encodeURI(file.webkitRelativePath)
    //
    // The loader now keeps both sides as decoded archive paths, matching its unzip and upload stages.
    const context = {
      source: files,
      options: {},
      live2dModel: new Live2DModel(),
    }

    try {
      await expect(FileLoader.factory(context, async () => {})).resolves.toBeUndefined()
    }
    finally {
      for (const resourceUrl of Object.values(FileLoader.filesMap[objectUrl] ?? {}))
        URL.revokeObjectURL(resourceUrl)
      delete FileLoader.filesMap[objectUrl]
    }
  })

  it('loads a zip model whose settings and resources contain spaces', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader, Live2DModel, ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('Model Package/Avatar Model.model3.json', createSpacePathSettingsText())
    zip.file('Model Package/Avatar Model.moc3', new Uint8Array([77, 79, 67, 51]))
    zip.file('Model Package/Avatar Model.4096/texture 00.png', new Uint8Array([1, 2, 3]))

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)
    const files = Object.assign(await ZipLoader.unzip(reader, settings), { settings })
    const objectUrl = `zip://test/${settings.url}`
    Object.assign(settings, { _objectURL: objectUrl })

    // ROOT CAUSE:
    //
    // ModelSettings.resolveURL percent-encodes spaces while ZipLoader and OPFS preserve
    // decoded archive paths. FileLoader therefore rejects resources that are present.
    //
    // Model Package/Avatar Model.moc3
    // !== Model%20Package/Avatar%20Model.moc3
    //
    // We fixed this by comparing canonical decoded archive paths at the loader boundary.
    const context = {
      source: files,
      options: {},
      live2dModel: new Live2DModel(),
    }

    try {
      await expect(FileLoader.factory(context, async () => {})).resolves.toBeUndefined()
    }
    finally {
      for (const resourceUrl of Object.values(FileLoader.filesMap[objectUrl] ?? {}))
        URL.revokeObjectURL(resourceUrl)
      delete FileLoader.filesMap[objectUrl]
    }
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

  it('ignores macOS AppleDouble expression sidecars during zip metadata extraction', async () => {
    await import('./live2d-zip-loader')
    const { ZipLoader } = await import('pixi-live2d-display/cubism4')

    const zip = new JSZip()
    zip.file('302301_shisihangshi/302301_shisihangshi.model3.json', createShisihangshiSettingsText())
    zip.file('302301_shisihangshi/expressions/happy.exp3.json', JSON.stringify({
      Type: 'Live2D Expression',
      Parameters: [{ Id: 'ParamEyeLOpen', Value: 1, Blend: 'Add' }],
    }))
    zip.file('__MACOSX/302301_shisihangshi/expressions/._happy.exp3.json', appleDoubleHeader)

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const reader = await JSZip.loadAsync(await blobFromBytes(zipBytes).arrayBuffer())
    const settings = await ZipLoader.createSettings(reader)

    // ROOT CAUSE:
    //
    // Metadata extraction scanned every ZIP entry. It parsed the AppleDouble sidecar as JSON,
    // then discarded the valid expression metadata when that parse failed.
    //
    // The loader now removes macOS metadata paths before it discovers model resources.
    expect(settings).toHaveProperty('_expFiles', [
      {
        name: 'happy',
        fileName: '302301_shisihangshi/expressions/happy.exp3.json',
        data: {
          Type: 'Live2D Expression',
          Parameters: [{ Id: 'ParamEyeLOpen', Value: 1, Blend: 'Add' }],
        },
      },
    ])
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
    expect(() => settings.validateFiles(files.map(file => file.webkitRelativePath))).not.toThrow()
  })

  it('loads an OPFS-restored file directory whose settings and resources use CJK paths', async () => {
    await import('./live2d-zip-loader')
    const { FileLoader, Live2DModel } = await import('pixi-live2d-display/cubism4')

    const files = [
      fileWithRelativePath(
        createCjkPathSettingsText(),
        '测试角色.model3.json',
        '中文路径模型/测试角色.model3.json',
      ),
      fileWithRelativePath(
        new Uint8Array([77, 79, 67, 51]),
        '测试角色.moc3',
        '中文路径模型/测试角色.moc3',
      ),
      fileWithRelativePath(
        new Uint8Array([1, 2, 3]),
        'texture_00.png',
        '中文路径模型/中文纹理/texture_00.png',
      ),
    ]
    const existingObjectUrls = new Set(Object.keys(FileLoader.filesMap))
    const context = {
      source: files,
      options: {},
      live2dModel: new Live2DModel(),
    }

    try {
      await expect(FileLoader.factory(context, async () => {})).resolves.toBeUndefined()
    }
    finally {
      for (const objectUrl of Object.keys(FileLoader.filesMap)) {
        if (existingObjectUrls.has(objectUrl))
          continue

        for (const resourceUrl of Object.values(FileLoader.filesMap[objectUrl] ?? {}))
          URL.revokeObjectURL(resourceUrl)
        URL.revokeObjectURL(objectUrl)
        delete FileLoader.filesMap[objectUrl]
      }
    }
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
