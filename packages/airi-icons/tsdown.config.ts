import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { importDirectory } from '@iconify/tools'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.js'],
  deps: {
    neverBundle: ['./icons.json'],
  },
  hooks: {
    'build:done': async ({ options }) => {
      const iconSet = await importDirectory(resolve(options.cwd, 'assets'), {
        prefix: 'airi-icons',
      })

      await writeFile(resolve(options.outDir, 'icons.json'), `${JSON.stringify(iconSet.export(), null, 2)}\n`)
    },
  },
})
