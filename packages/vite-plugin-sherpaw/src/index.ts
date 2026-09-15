import type { DataMetadata } from '@sherpaw/preloader'
import type { Plugin } from 'vite'

import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { Download } from '@proj-airi/unplugin-fetch/vite'
import { sherpawModelPath, sherpawModels } from '@proj-airi/vite-plugin-sherpaw/models'

/** Storage for model downloads. The Vite public directory owns runtime assets. */
export interface SherpawOptions {
  /** Shared download cache, resolved against the Vite root. @default '.cache' */
  cacheDir?: string
}

/**
 * Downloads pinned models and places their data and metadata in Vite's public directory.
 * Vite copies that directory into each build. Development serves the same files.
 * Failed downloads reject configuration, so a build cannot silently omit a model.
 */
export function sherpaw(options: SherpawOptions = {}): Plugin[] {
  const bilingual = sherpawModels['zh-en']
  const multilingual = sherpawModels.multilingual
  const sourceDirectory = join('sherpaw-sources', bilingual.revision)
  const files = [
    { source: 'encoder.int8.onnx', filename: '/encoder.onnx' },
    { source: 'decoder.int8.onnx', filename: '/decoder.onnx' },
    { source: 'tokens.txt', filename: '/tokens.txt' },
  ]
  let publicDirectory: string
  let cacheDirectory: string

  return [
    {
      name: 'airi-sherpaw-models',
      apply: (_config, environment) => !environment.isPreview,
      async configResolved(config) {
        if (!config.publicDir)
          throw new Error('Sherpaw requires a Vite public directory.')
        publicDirectory = config.publicDir
        cacheDirectory = resolve(config.root, options.cacheDir ?? '.cache')

        // Invoke the downloader inside this hook so packing starts only after all
        // downloads finish. Vite runs separate configResolved hooks concurrently.
        const downloads = [
          ...files.map(file => Download(
            `https://huggingface.co/${bilingual.repository}/resolve/${bilingual.revision}/${file.source}`,
            file.source,
            sourceDirectory,
            { cacheDir: cacheDirectory, parentDir: cacheDirectory },
          )),
          ...['preload.data', 'preload.js.metadata'].map(filename => Download(
            `https://huggingface.co/${multilingual.repository}/resolve/${multilingual.revision}/install/bin/wasm/${filename}`,
            filename,
            sherpawModelPath('multilingual'),
            { cacheDir: cacheDirectory, parentDir: publicDirectory },
          )),
        ]
        await Promise.all(downloads.map(async (plugin) => {
          const hook = plugin.configResolved
          if (typeof hook === 'function')
            await hook.call(this, config)
          else if (hook)
            await hook.handler.call(this, config)
        }))

        const chunks = await Promise.all(files.map(file => readFile(join(cacheDirectory, sourceDirectory, file.source))))
        let offset = 0
        const metadata: DataMetadata = {
          files: files.map((file, index) => {
            const start = offset
            offset += chunks[index].byteLength
            return { filename: file.filename, start, end: offset }
          }),
          remote_package_size: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
        }
        const destination = join(publicDirectory, sherpawModelPath('zh-en'))
        await mkdir(destination, { recursive: true })
        await writeFile(join(destination, 'preload.data'), Buffer.concat(chunks))
        await writeFile(join(destination, 'preload.js.metadata'), JSON.stringify(metadata))
      },
    },
  ]
}
