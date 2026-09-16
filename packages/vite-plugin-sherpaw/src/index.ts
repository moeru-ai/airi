import type { DataMetadata } from '@sherpaw/preloader'
import type { Plugin } from 'vite'

import type { SherpawModel } from './models'

import { Buffer } from 'node:buffer'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { Download } from '@proj-airi/unplugin-fetch/vite'
import { sherpawModelPath } from '@proj-airi/vite-plugin-sherpaw/models'

/** Selects models for this application. Downloads remain in a separate cache. */
export interface SherpawOptions {
  /** Only these models are bundled. An empty list clears previously bundled models. */
  models: readonly SherpawModel[]
  /** Shared download cache, resolved against the Vite root. @default '.cache' */
  cacheDir?: string
}

/**
 * Downloads selected presets and owns the `sherpaw` directory under Vite's public directory.
 * Each configuration replaces that directory, so removed presets cannot remain in later builds.
 * Download failures stop configuration. The separate cache survives selection changes.
 */
export function Sherpaw(options: SherpawOptions): Plugin {
  return {
    name: 'airi-sherpaw-models',
    apply: (_config, environment) => !environment.isPreview,
    async configResolved(config) {
      if (!config.publicDir)
        throw new Error('Sherpaw requires a Vite public directory.')
      const cacheDirectory = resolve(config.root, options.cacheDir ?? '.cache')
      await rm(join(config.publicDir, 'sherpaw'), { recursive: true, force: true })

      for (const model of options.models) {
        const outputPath = sherpawModelPath(model)
        const sourceDirectory = join('sherpaw-sources', model.id, model.revision)
        const source = model.source
        const downloads = source.format === 'files'
          ? source.files.map(file => Download(
              `https://huggingface.co/${model.repository}/resolve/${model.revision}/${file.source}`,
              file.source,
              sourceDirectory,
              { cacheDir: cacheDirectory, parentDir: cacheDirectory },
            ))
          : ['preload.data', 'preload.js.metadata'].map(filename => Download(
              `https://huggingface.co/${model.repository}/resolve/${model.revision}/${source.directory}/${filename}`,
              filename,
              outputPath,
              { cacheDir: cacheDirectory, parentDir: config.publicDir },
            ))

        // Separate Vite configResolved hooks run concurrently. Await downloads here
        // before reading source files or letting Vite copy the public directory.
        await Promise.all(downloads.map(async (plugin) => {
          const hook = plugin.configResolved
          if (typeof hook === 'function')
            await hook.call(this, config)
          else if (hook)
            await hook.handler.call(this, config)
        }))

        if (model.source.format !== 'files')
          continue

        const files = model.source.files
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
        const destination = join(config.publicDir, outputPath)
        await mkdir(destination, { recursive: true })
        await writeFile(join(destination, 'preload.data'), Buffer.concat(chunks))
        await writeFile(join(destination, 'preload.js.metadata'), JSON.stringify(metadata))
      }
    },
  }
}
