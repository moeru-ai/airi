/* eslint-disable no-console */
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ofetch } from 'ofetch'
import { exists } from '../scripts/fs'

export function fileDownloader(
  url: string,
  filename: string,
  destination: string,
): Plugin {
  return {
    name: `file-downloader-${filename}`,
    async configResolved(config) {
      const cacheDir = resolve(join(config.root, '.cache'))
      const publicDir = resolve(join(config.root, 'public'))

      try {
        // cache
        if (await exists(resolve(join(cacheDir, destination, filename)))) {
          return
        }

        console.log(`Downloading ${filename}...`)
        const stream = await ofetch(url, { responseType: 'arrayBuffer' })
        await mkdir(join(cacheDir, destination), { recursive: true })
        await writeFile(join(cacheDir, destination, filename), Buffer.from(stream))

        console.log(`${filename} downloaded.`)

        if (await exists(resolve(join(publicDir, destination, filename)))) {
          return
        }

        await mkdir(join(publicDir, destination), { recursive: true }).catch(() => { })
        await copyFile(join(cacheDir, destination, filename), join(publicDir, destination, filename))

        // TODO: use motion editor to remap emotions
      }
      catch (err) {
        console.error(err)
        throw err
      }
    },
  }
}
