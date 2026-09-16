import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { build } from 'vite'
import { expect, it } from 'vitest'

import { Sherpaw } from './index'
import { paraformerBilingualZhEn, sherpawModelPath, zipformerMultilingual } from './models'

it('packs cached models and includes them in a production build', async () => {
  const parent = join(import.meta.dirname, '../../../.cache')
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, 'sherpaw-build-'))
  try {
    const cacheDir = join(root, 'cache')
    const source = join(cacheDir, 'sherpaw-sources', paraformerBilingualZhEn.id, paraformerBilingualZhEn.revision)
    const multilingual = join(cacheDir, sherpawModelPath(zipformerMultilingual))
    await mkdir(source, { recursive: true })
    await mkdir(multilingual, { recursive: true })
    await writeFile(join(root, 'index.html'), '<html><body>Speech test</body></html>')
    await writeFile(join(source, 'encoder.int8.onnx'), new Uint8Array([1, 2]))
    await writeFile(join(source, 'decoder.int8.onnx'), new Uint8Array([3]))
    await writeFile(join(source, 'tokens.txt'), 'a')
    await writeFile(join(multilingual, 'preload.data'), new Uint8Array([9]))
    await writeFile(join(multilingual, 'preload.js.metadata'), '{}')

    await build({ root, configFile: false, logLevel: 'silent', base: '/nested/', plugins: [Sherpaw({ models: [paraformerBilingualZhEn], cacheDir })] })
    await expect(readFile(join(root, 'dist', sherpawModelPath(zipformerMultilingual), 'preload.data'))).rejects.toMatchObject({ code: 'ENOENT' })

    const output = join(root, 'dist', sherpawModelPath(paraformerBilingualZhEn))
    expect([...await readFile(join(output, 'preload.data'))]).toEqual([1, 2, 3, 97])
    expect(JSON.parse(await readFile(join(output, 'preload.js.metadata'), 'utf8'))).toEqual({
      files: [
        { filename: '/encoder.onnx', start: 0, end: 2 },
        { filename: '/decoder.onnx', start: 2, end: 3 },
        { filename: '/tokens.txt', start: 3, end: 4 },
      ],
      remote_package_size: 4,
    })
    await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models: [paraformerBilingualZhEn, zipformerMultilingual], cacheDir })] })
    expect([...await readFile(join(root, 'dist', sherpawModelPath(zipformerMultilingual), 'preload.data'))]).toEqual([9])

    // ROOT CAUSE:
    // Vite copies the whole public directory, including assets from earlier builds.
    // Replacing plugin-owned output must remove deselected models while keeping the cache.
    await writeFile(join(root, 'public', 'unrelated.txt'), 'keep')
    await rm(source, { recursive: true })
    await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models: [zipformerMultilingual], cacheDir })] })
    await expect(readFile(join(output, 'preload.data'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect([...await readFile(join(root, 'dist', sherpawModelPath(zipformerMultilingual), 'preload.data'))]).toEqual([9])
    expect(await readFile(join(root, 'dist', 'unrelated.txt'), 'utf8')).toBe('keep')

    await build({ root, configFile: false, logLevel: 'silent', plugins: [Sherpaw({ models: [], cacheDir })] })
    await expect(readFile(join(root, 'dist', sherpawModelPath(zipformerMultilingual), 'preload.data'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect([...await readFile(join(multilingual, 'preload.data'))]).toEqual([9])
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
