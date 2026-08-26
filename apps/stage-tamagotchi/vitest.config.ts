import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'
import Info from 'unplugin-info/vite'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    Info(),
    vue(),
  ],
  root: import.meta.dirname,
  test: {
    env: loadEnv('test', cwd(), ''),
    projects: [
      {
        extends: true,
        test: {
          exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/.git/**'],
          fileParallelism: false,
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          maxWorkers: 1,
          name: 'node',
        },
      },
      {
        extends: true,
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [
              { browser: 'chromium' },
            ],
            provider: playwright(),
          },
          exclude: ['**/node_modules/**', '**/.git/**'],
          include: ['src/**/*.browser.test.ts'],
          name: 'browser',
        },
      },
    ],
  },
})
