import { join, resolve } from 'node:path'
import { cwd } from 'node:process'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return ({
    resolve: {
      alias: {
        '@proj-airi/server-sdk': resolve(join(import.meta.dirname, '..', 'server-sdk', 'src')),
        '@proj-airi/server-shared': resolve(join(import.meta.dirname, '..', 'server-shared', 'src')),
        '@proj-airi/server-shared/types': resolve(join(import.meta.dirname, '..', 'server-shared', 'src', 'types', 'index.ts')),
        '@proj-airi/stream-kit': resolve(join(import.meta.dirname, '..', 'stream-kit', 'src')),
      },
    },
    test: {
      include: ['src/**/*.test.ts'],
      env: loadEnv(mode, join(cwd(), 'packages', 'stage-ui'), ''),
    },
  })
})
