import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'
import Info from 'unplugin-info/vite'

import { loadEnv } from 'vite'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [Info(), vue()],
  root: import.meta.dirname,
  test: {
    env: loadEnv('test', cwd(), ''),
    exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/.git/**'],
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    maxWorkers: 1,
    name: 'stage-tamagotchi:node',
  },
})
