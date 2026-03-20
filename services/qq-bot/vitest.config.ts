import { cwd } from 'node:process'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    test: {
      env: loadEnv(mode, cwd(), ''),
      environment: 'node',
      include: ['src/**/*.{spec,test}.ts'],
      exclude: ['**/node_modules/**'],
    },
  }
})
