import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    workspace: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.{spec,test}.ts'],
          exclude: ['**/*.browser.{spec,test}.ts', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['**/*.browser.{spec,test}.ts'],
          exclude: ['**/node_modules/**'],
          browser: {
            enabled: true,
            provider: 'playwright',
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
  },
})
