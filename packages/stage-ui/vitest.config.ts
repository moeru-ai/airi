import { join } from 'node:path'
import { cwd } from 'node:process'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return ({
    test: {
      include: ['src/**/*.test.ts'],
      env: loadEnv(mode, join(cwd(), 'packages', 'stage-ui'), ''),
    },
  })
})
