import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          exclude: ['src/**/*.browser.test.ts'],
          include: ['src/**/*.test.ts'],
          name: 'node',
        },
      },
      {
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [
              { browser: 'chromium' },
            ],
            provider: playwright(),
          },
          include: ['src/**/*.browser.test.ts'],
          name: 'browser',
        },
      },
    ],
  },
})
