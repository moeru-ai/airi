import type { Plugin } from 'vite'

import { Buffer } from 'node:buffer'
import { copyFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ofetch } from 'ofetch'
import { createLogger } from 'vite'

import { exists, unzip } from '../utils'

export function DownloadLive2DSDK(): Plugin {
  return {
    name: `download-live2d-cubism-sdk`,
    async configResolved(config) {
      const logger = createLogger()

      const cacheDir = resolve(join(config.root, '.cache'))
      const publicDir = resolve(join(config.root, 'public'))

      try {
        // cache
        if (!(await exists(resolve(join(cacheDir, 'assets/js/CubismSdkForWeb-5-r.1'))))) {
          logger.info('Downloading Cubism SDK...')
          const stream = await ofetch('https://dist.ayaka.moe/npm/live2d-cubism/CubismSdkForWeb-5-r.1.zip', { responseType: 'arrayBuffer' })

          logger.info('Unzipping Cubism SDK...')
          await mkdir(join(cacheDir, 'assets/js'), { recursive: true })
          await unzip(Buffer.from(stream), join(cacheDir, 'assets/js'))

          logger.info('Cubism SDK downloaded and unzipped.')
        }

        if (!(await exists(resolve(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1'))))) {
          await mkdir(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1/Core'), { recursive: true }).catch(() => {})
          await copyFile(join(cacheDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'), join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'))
        }
      }
      catch (err) {
        console.error(err)
        throw err
      }
    },
  }
}
