import { join, resolve } from 'node:path'
import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'
import Info from 'unplugin-info/vite'

import { loadEnv } from 'vite'
import { defineProject } from 'vitest/config'

export default defineProject({
  root: import.meta.dirname,
  plugins: [Info(), vue()],
  resolve: {
    alias: {
      '@proj-airi/core-agent': resolve(join(import.meta.dirname, '..', '..', 'packages', 'core-agent', 'src', 'index.ts')),
    },
  },
  test: {
    name: 'stage-tamagotchi:node',
    env: loadEnv('test', cwd(), ''),
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/.git/**'],
    fileParallelism: false,
    maxWorkers: 1,
  },
})
