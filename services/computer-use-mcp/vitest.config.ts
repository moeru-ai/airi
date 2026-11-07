import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'chrome-extension/bridge-config.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['chrome-extension/**/*.browser.test.js'],
          globalSetup: ['./chrome-extension/background-test-server.js'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
