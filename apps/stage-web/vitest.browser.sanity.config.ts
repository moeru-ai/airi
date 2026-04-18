import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { playwrightBrowserProvider } from './src/testing/vitest-playwright-provider'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: 'expect-type', replacement: resolve(root, 'src/testing/lesson-browser-stubs/expect-type.ts') },
    ],
  },
  test: {
    include: ['src/testing/browser-sanity.browser.test.ts'],
    browser: {
      provider: playwrightBrowserProvider(),
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
