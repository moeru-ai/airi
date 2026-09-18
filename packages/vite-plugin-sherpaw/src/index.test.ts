import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Basemove from 'unplugin-basemove/vite'

import { build, createServer } from 'vite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Sherpaw } from './index'
import { paraformerBilingualZhEn, sherpawModelPath, zipformerBilingualZhEn, zipformerMultilingual } from './models'

const models = [paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual]
let root: string
let cacheDir: string

beforeEach(async () => {
  const parent = join(import.meta.dirname, '../../../.cache')
  await mkdir(parent, { recursive: true })
  root = await mkdtemp(join(parent, 'sherpaw-build-'))
  cacheDir = join(root, 'cache')
  await mkdir(join(root, 'public'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
  await writeFile(join(root, 'main.js'), `import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'; globalThis.modelAssets = assets`)
  for (const [index, model] of models.entries()) {
    const cache = join(cacheDir, sherpawModelPath(model))
    await mkdir(cache, { recursive: true })
    await writeFile(join(cache, 'preload.data'), new Uint8Array(index + 1).fill(index + 1))
    await writeFile(join(cache, 'preload.js.metadata'), JSON.stringify({
      files: [{ filename: '/encoder.onnx', start: 0, end: index + 1 }],
      remote_package_size: index + 1,
    }))
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('bundles selected published model pairs without repacking their contents', async () => {
  await build({ root, configFile: false, logLevel: 'silent', base: '/nested/', plugins: [Sherpaw({ models: [paraformerBilingualZhEn], cacheDir })] })
  const directory = join(root, 'dist', 'assets')
  let files = await readdir(directory)
  const data = files.filter(file => file.endsWith('.data'))
  expect(data).toHaveLength(1)
  expect([...await readFile(join(directory, data[0]))]).toEqual([1])
  const script = files.find(file => file.endsWith('.js'))!
  expect(await readFile(join(directory, script), 'utf8')).toContain(`/nested/assets/${data[0]}`)

  await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models, cacheDir })] })
  files = await readdir(directory)
  for (const extension of ['data', 'metadata']) {
    const emitted = await Promise.all(files.filter(file => file.endsWith(`.${extension}`)).map(file => readFile(join(directory, file))))
    expect(emitted).toHaveLength(3)
    for (const model of models) {
      const filename = extension === 'data' ? 'preload.data' : 'preload.js.metadata'
      expect(emitted).toContainEqual(await readFile(join(cacheDir, sherpawModelPath(model), filename)))
    }
  }

  // ROOT CAUSE:
  // Vite copies the whole public directory, including assets from earlier builds.
  // Clearing plugin-owned output removes deselected models while keeping the cache.
  const stale = join(root, 'public', sherpawModelPath(paraformerBilingualZhEn))
  await mkdir(stale, { recursive: true })
  await writeFile(join(stale, 'preload.data'), 'old model')
  await writeFile(join(root, 'public', 'unrelated.txt'), 'keep')
  await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models: [zipformerBilingualZhEn], cacheDir })] })
  await expect(readFile(join(root, 'dist', sherpawModelPath(paraformerBilingualZhEn), 'preload.data'))).rejects.toMatchObject({ code: 'ENOENT' })
  files = await readdir(directory)
  const remaining = files.filter(file => file.endsWith('.data'))
  expect(remaining).toHaveLength(1)
  expect([...await readFile(join(directory, remaining[0]))]).toEqual([2, 2])
  expect(await readFile(join(root, 'dist', 'unrelated.txt'), 'utf8')).toBe('keep')

  await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models: [], cacheDir })] })
  files = await readdir(directory)
  expect(files.filter(file => /\.(?:data|metadata)$/.test(file))).toEqual([])
  for (const [index, model] of models.entries())
    expect([...await readFile(join(cacheDir, sherpawModelPath(model), 'preload.data'))]).toEqual(Array.from({ length: index + 1 }).fill(index + 1))
})

// https://github.com/moeru-ai/airi/pull/2550
it('uploads model assets through Basemove and removes local deployment copies', async () => {
  // ROOT CAUSE:
  // Models in public/ bypass Vite asset imports. Basemove therefore cannot track,
  // upload, or remove them, and runtime-built URLs still point to the deployment.
  // URL imports now put both files through Vite's asset and URL-rewriting hooks.
  const uploaded = new Map<string, Uint8Array>()
  const upload = vi.fn(async (localPath: string, key: string) => {
    uploaded.set(key, await readFile(localPath))
  })
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      Sherpaw({ models, cacheDir }),
      Basemove({
        include: [/\.(?:data|metadata)$/i],
        prefix: 'test-models',
        clean: false,
        manifest: true,
        provider: {
          getPublicUrl: key => `https://models.example.test/${key}`,
          upload,
        },
      }),
    ],
  })
  expect(upload).toHaveBeenCalledTimes(6)
  const directory = join(root, 'dist', 'assets')
  const files = await readdir(directory)
  expect(files.filter(file => /\.(?:data|metadata)$/.test(file))).toEqual([])
  const script = files.find(file => file.endsWith('.js'))!
  const code = await readFile(join(directory, script), 'utf8')
  for (const key of uploaded.keys())
    expect(code).toContain(`https://models.example.test/${key}`)
  const manifest = JSON.parse(await readFile(join(root, 'dist', 'remote-assets.manifest.json'), 'utf8'))
  expect(manifest.assets).toHaveLength(6)
  for (const model of models) {
    expect([...uploaded.values()]).toContainEqual(await readFile(join(cacheDir, sherpawModelPath(model), 'preload.data')))
    expect([...uploaded.values()]).toContainEqual(await readFile(join(cacheDir, sherpawModelPath(model), 'preload.js.metadata')))
  }
})

it('keeps model URLs relative to the built module for packaged Electron', async () => {
  await build({ root, configFile: false, logLevel: 'silent', base: './', plugins: [Sherpaw({ models: [zipformerBilingualZhEn], cacheDir })] })
  const directory = join(root, 'dist', 'assets')
  const files = await readdir(directory)
  const script = files.find(file => file.endsWith('.js'))!
  const code = await readFile(join(directory, script), 'utf8')
  expect(code).toContain('import.meta.url')
  for (const filename of files.filter(file => /\.(?:data|metadata)$/.test(file))) {
    expect(code).toContain(filename)
    expect(code).not.toContain(`/assets/${filename}`)
  }
})

it('serves cached model data through Vite during development', async () => {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    base: '/nested/',
    plugins: [Sherpaw({ models: [paraformerBilingualZhEn], cacheDir })],
    server: { host: '127.0.0.1', port: 0 },
  })
  try {
    await server.listen()
    const origin = server.resolvedUrls?.local[0]
    if (!origin)
      throw new Error('Vite did not expose a local test URL.')
    const module = await server.transformRequest('@proj-airi/vite-plugin-sherpaw/assets')
    expect(module?.code).toContain('paraformer-zh-en')
    for (const filename of ['preload.data', 'preload.js.metadata']) {
      const path = `${sherpawModelPath(paraformerBilingualZhEn)}/${filename}`
      const url = `/nested/cache/${path}?no-inline`
      const asset = await server.transformRequest(`${join(cacheDir, path)}?url&no-inline`)
      expect(asset?.code).toContain(JSON.stringify(url))
      const response = await fetch(new URL(url, origin))
      expect(response.status).toBe(200)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(await readFile(join(cacheDir, path))))
    }
  }
  finally {
    await server.close()
  }
})
