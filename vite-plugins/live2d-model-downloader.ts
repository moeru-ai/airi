/* eslint-disable no-console */
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ofetch } from 'ofetch'
import { exists } from '../scripts/fs'

export function live2dModelDownloader(filename: string): Plugin {
  return {
    name: `live2d-model-downloader-${filename}`,
    async configResolved(config) {
      const cacheDir = resolve(join(config.root, '.cache'))
      const publicDir = resolve(join(config.root, 'public'))

      try {
        if (await exists(resolve(join(cacheDir, 'assets/live2d/models', filename)))) {
          return
        }

        console.log(`Downloading Demo Live2D Model - ${filename}...`)
        const stream = await ofetch(`https://dist.ayaka.moe/live2d-models/${filename}.zip`, { responseType: 'arrayBuffer' })

        console.log(`Unzipping Demo Live2D Model - ${filename}...`)
        await mkdir(join(cacheDir, 'assets/live2d/models'), { recursive: true })
        await writeFile(join(cacheDir, `assets/live2d/models/${filename}.zip`), Buffer.from(stream))

        console.log(`Demo Live2D Model - ${filename} downloaded.`)

        if (await exists(resolve(join(publicDir, 'assets/live2d/models', filename)))) {
          return
        }

        await mkdir(join(publicDir, 'assets/live2d/models'), { recursive: true }).catch(() => { })
        await copyFile(join(cacheDir, `assets/live2d/models/${filename}.zip`), join(publicDir, `assets/live2d/models/${filename}.zip`))

        // TODO: use motion editor to remap emotions
      }
      catch (err) {
        console.error(err)
        throw err
      }
    },
  }
}
