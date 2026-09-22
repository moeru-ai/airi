import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Basemove from 'unplugin-basemove/vite'

import { paraformerBilingualZhEn, sherpawModelPath, zipformerBilingualZhEn, zipformerMultilingual } from '@proj-airi/sherpaw-models'
import { build, createServer } from 'vite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Sherpaw } from './index'

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

it('exposes remote models without downloading or emitting their assets', async () => {
  await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models })] })
  const directory = join(root, 'dist', 'assets')
  const files = await readdir(directory)
  expect(files.filter(file => /\.(?:data|metadata)$/.test(file))).toEqual([])
  const script = files.find(file => file.endsWith('.js'))!
  const code = await readFile(join(directory, script), 'utf8')
  for (const model of models) {
    expect(code).toContain(model.id)
    expect(code).toContain(model.revision)
  }
  expect(code).toContain('remote')
})

it('bundles only the explicit bundled model subset', async () => {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    base: '/nested/',
    plugins: [Sherpaw({ models, bundledModels: [paraformerBilingualZhEn], cacheDir })],
  })
  const directory = join(root, 'dist', 'assets')
  const files = await readdir(directory)
  const data = files.filter(file => file.endsWith('.data'))
  expect(data).toHaveLength(1)
  expect([...await readFile(join(directory, data[0]))]).toEqual([1])
  const script = files.find(file => file.endsWith('.js'))!
  const code = await readFile(join(directory, script), 'utf8')
  expect(code).toContain(`/nested/assets/${data[0]}`)
  expect(code).toContain('bundled')
  expect(code).toContain(zipformerMultilingual.revision)
})

it('rejects a bundled model that the runtime catalogue does not expose', async () => {
  await expect(build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [Sherpaw({ models: [], bundledModels: [paraformerBilingualZhEn], cacheDir })],
  })).rejects.toThrow('must also be listed in models')
})

it('uploads bundled assets through Basemove and keeps remote models remote', async () => {
  // ROOT CAUSE:
  //
  // Files copied through public/ bypass Vite's asset graph. Basemove cannot upload or
  // rewrite those URLs. Bundled model pairs now enter the graph through URL imports,
  // while models outside bundledModels keep their pinned remote URLs.
  const uploaded = new Map<string, Uint8Array>()
  const upload = vi.fn(async (localPath: string, key: string) => {
    uploaded.set(key, await readFile(localPath))
  })
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      Sherpaw({ models, bundledModels: [paraformerBilingualZhEn], cacheDir }),
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
  expect(upload).toHaveBeenCalledTimes(2)
  const directory = join(root, 'dist', 'assets')
  const files = await readdir(directory)
  expect(files.filter(file => /\.(?:data|metadata)$/.test(file))).toEqual([])
  const script = files.find(file => file.endsWith('.js'))!
  const code = await readFile(join(directory, script), 'utf8')
  for (const key of uploaded.keys())
    expect(code).toContain(`https://models.example.test/${key}`)
  expect(code).toContain(zipformerMultilingual.revision)
})

it('keeps bundled model URLs relative for packaged Electron', async () => {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    base: './',
    plugins: [Sherpaw({ models, bundledModels: [zipformerBilingualZhEn], cacheDir })],
  })
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

it('serves a bundled fixture through Vite during development', async () => {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    base: '/nested/',
    plugins: [Sherpaw({ models, bundledModels: [paraformerBilingualZhEn], cacheDir })],
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
