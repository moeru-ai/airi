import { dirname } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          root: dirname(fileURLToPath(import.meta.url)),
          env: loadEnv(mode, dirname(fileURLToPath(import.meta.url))),
          exclude: ['**/*.browser.{spec,test}.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'browser',
          root: dirname(fileURLToPath(import.meta.url)),
          include: ['**/*.browser.{spec,test}.ts'],
          exclude: ['**/node_modules/**'],
          browser: {
            enabled: true,
            // NOTICE: CI uses the GitHub-hosted runner's preinstalled Google Chrome.
            // Playwright's Chromium installer is currently hanging after the download
            // reaches 100%, so CI selects Chrome by channel while local runs keep the
            // default bundled Chromium behavior.
            provider: playwright(env.CI ? { launchOptions: { channel: 'chrome' } } : undefined),
            // at least one instance is required
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
  },
}))
