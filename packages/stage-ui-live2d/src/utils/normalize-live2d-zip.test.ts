import url from 'node:url'

import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { normalizeLive2DZip } from './normalize-live2d-zip'

/** JSZip's Blob path needs FileReader, which Node lacks — read the bytes first. */
async function openZip(file: File): Promise<JSZip> {
  return JSZip.loadAsync(await file.arrayBuffer())
}

interface ModelFiles {
  settingsPath: string
  moc: string
  textures: string[]
  physics?: string
  expressions?: string[]
}

async function buildArchive({ settingsPath, moc, textures, physics, expressions = [] }: ModelFiles): Promise<File> {
  const directory = settingsPath.includes('/') ? `${settingsPath.replace(/\/[^/]*$/, '')}/` : ''
  const zip = new JSZip()

  zip.file(settingsPath, JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: moc,
      Textures: textures,
      ...(physics ? { Physics: physics } : {}),
    },
    Groups: [{ Target: 'Parameter', Name: 'LipSync', Ids: [] }],
  }))

  // A real .moc3 begins with the ASCII magic "MOC3"; the loader reads it before
  // anything else, so keep the header honest even in fixtures.
  zip.file(`${directory}${moc}`, new Uint8Array([0x4D, 0x4F, 0x43, 0x33, 0x05]))
  textures.forEach(texture => zip.file(`${directory}${texture}`, new Uint8Array([0x89, 0x50, 0x4E, 0x47])))
  if (physics)
    zip.file(`${directory}${physics}`, JSON.stringify({ PhysicsSettings: [] }))
  expressions.forEach(expression => zip.file(`${directory}${expression}`, JSON.stringify({ Type: 'Live2D Expression' })))

  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'model.zip')
}

/**
 * Replays the exact comparison pixi-live2d-display performs on load.
 *
 * FileLoader.factory hands `validateFiles` an encodeURI()'d path list, while
 * ModelSettings.resolveURL returns the raw `url.resolve` output — so this is the
 * `files.includes(actualPath)` check that decides whether a model loads.
 */
async function loadsInPixiLive2DDisplay(file: File): Promise<boolean> {
  const zip = await openZip(file)
  const paths = Object.keys(zip.files).filter(path => !zip.files[path].dir)
  const settingsPath = paths.find(path => path.endsWith('.model3.json'))!
  const settings = JSON.parse(await zip.file(settingsPath)!.async('string'))

  const encodedPaths = paths.map(path => encodeURI(path))
  const references: string[] = [settings.FileReferences.Moc, ...settings.FileReferences.Textures]
  if (settings.FileReferences.Physics)
    references.push(settings.FileReferences.Physics)

  // NOTICE:
  // url.resolve is deprecated, but pixi-live2d-display's ModelSettings.resolveURL
  // calls exactly this function, and the whole point of this helper is to be
  // bug-compatible with it. Swapping in the WHATWG URL parser would change the
  // encoding behaviour under test and stop reproducing the failure.
  // Source/context: pixi-live2d-display/dist/cubism4.es.js — `resolveURL(path)
  // { return url.resolve(this.url, path) }`.
  // Removal condition: the dependency stops using the legacy url module.
  // eslint-disable-next-line node/no-deprecated-api
  return references.every(reference => encodedPaths.includes(url.resolve(settingsPath, reference)))
}

describe('normalizeLive2DZip', () => {
  it('leaves an all-ASCII archive untouched', async () => {
    const file = await buildArchive({
      settingsPath: 'hiyori/hiyori.model3.json',
      moc: 'hiyori.moc3',
      textures: ['textures/texture_00.png'],
      physics: 'hiyori.physics3.json',
    })

    const normalized = await normalizeLive2DZip(file)

    // Repacking costs a full re-deflate of every texture, so archives the loader
    // would already accept must be returned by reference.
    expect(normalized).toBe(file)
  })

  // ROOT CAUSE:
  //
  // pixi-live2d-display compares two differently-encoded views of the same path:
  // FileLoader.factory passes encodeURI(webkitRelativePath) into validateFiles,
  // which looks entries up with the unencoded url.resolve(settings.url, ref).
  //
  // encodeURI is a no-op on ASCII, so every bundled model matched and the bug
  // stayed hidden; a CJK-named archive percent-encodes on one side only and
  // throws `File "<name>.moc3" is defined in settings, but doesn't exist in
  // given files` despite the entry being present.
  //
  // We fixed this by rewriting archive paths to ASCII on import, so both sides
  // of that comparison agree again.
  it('reproduces the loader path mismatch for a non-ASCII archive', async () => {
    const file = await buildArchive({
      settingsPath: '【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json',
      moc: '八千代辉夜姬.moc3',
      textures: ['八千代辉夜姬.8192/texture_00.png'],
      physics: '八千代辉夜姬.physics3.json',
    })

    expect(await loadsInPixiLive2DDisplay(file)).toBe(false)
    expect(await loadsInPixiLive2DDisplay(await normalizeLive2DZip(file))).toBe(true)
  })

  it('rewrites every entry path to ASCII', async () => {
    const file = await buildArchive({
      settingsPath: '【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json',
      moc: '八千代辉夜姬.moc3',
      textures: ['八千代辉夜姬.8192/texture_00.png', '八千代辉夜姬.8192/texture_01.png'],
    })

    const zip = await openZip(await normalizeLive2DZip(file))

    for (const path of Object.keys(zip.files))
      expect(path, `${path} should be ASCII`).toMatch(/^[\x20-\x7E]*$/)
  })

  it('keeps fully non-ASCII sibling names distinct instead of colliding', async () => {
    // Slugging `泪珠.exp3.json` as a whole yields a bare `.exp3.json` — the same
    // name every other expression produces — so all but the last would be lost.
    const file = await buildArchive({
      settingsPath: 'model/model.model3.json',
      moc: 'model.moc3',
      textures: ['texture_00.png'],
      expressions: ['泪珠.exp3.json', '眯眯眼.exp3.json', '眼泪.exp3.json', '笑咪咪.exp3.json'],
    })

    const zip = await openZip(await normalizeLive2DZip(file))
    const expressions = Object.keys(zip.files).filter(path => path.endsWith('.exp3.json'))

    expect(expressions).toHaveLength(4)
    expect(new Set(expressions).size).toBe(4)
  })

  it('preserves the settings references so they still resolve after renaming', async () => {
    const file = await buildArchive({
      settingsPath: '【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json',
      moc: '八千代辉夜姬.moc3',
      textures: ['八千代辉夜姬.8192/texture_00.png'],
      physics: '八千代辉夜姬.physics3.json',
    })

    const zip = await openZip(await normalizeLive2DZip(file))
    const settingsPath = Object.keys(zip.files).find(path => path.endsWith('.model3.json'))!
    const settings = JSON.parse(await zip.file(settingsPath)!.async('string'))
    const directory = settingsPath.replace(/\/[^/]*$/, '')

    expect(zip.file(`${directory}/${settings.FileReferences.Moc}`)).not.toBeNull()
    expect(zip.file(`${directory}/${settings.FileReferences.Physics}`)).not.toBeNull()
    for (const texture of settings.FileReferences.Textures)
      expect(zip.file(`${directory}/${texture}`)).not.toBeNull()
  })

  it('drops macOS resource-fork entries the loader would trip over', async () => {
    const zip = new JSZip()
    zip.file('モデル/model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'model.moc3', Textures: ['texture_00.png'] },
    }))
    zip.file('モデル/model.moc3', new Uint8Array([0x4D, 0x4F, 0x43, 0x33]))
    zip.file('モデル/texture_00.png', new Uint8Array([0x89, 0x50, 0x4E, 0x47]))
    zip.file('__MACOSX/モデル/._model.moc3', new Uint8Array([0x00]))

    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'model.zip')
    const normalized = await openZip(await normalizeLive2DZip(file))

    expect(Object.keys(normalized.files).some(path => path.includes('MACOSX'))).toBe(false)
    expect(Object.keys(normalized.files).some(path => path.includes('._'))).toBe(false)
  })
})
