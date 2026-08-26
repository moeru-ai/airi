import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    projects: [
      {
        test: {
          env: loadEnv(mode, dirname(fileURLToPath(import.meta.url))),
          exclude: ['**/*.browser.{spec,test}.ts', '**/node_modules/**'],
          name: 'node',
          root: dirname(fileURLToPath(import.meta.url)),
        },
      },
      {
        test: {
          browser: {
            enabled: true,
            headless: true,
            // Vitest browser mode requires an explicit browser instance list.
            instances: [
              { browser: 'chromium' },
            ],
            provider: playwright(),
          },
          exclude: ['**/node_modules/**'],
          include: ['**/*.browser.{spec,test}.ts'],
          name: 'browser',
          root: dirname(fileURLToPath(import.meta.url)),
        },
      },
    ],
  },
}))
