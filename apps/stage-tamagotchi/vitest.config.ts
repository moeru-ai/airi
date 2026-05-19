import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue(),
  ],
  test: {
    env: loadEnv('test', cwd(), ''),
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
  },
})
