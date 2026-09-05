import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    projects: [
      {
        // `live2d-runtime` imports `virtual:live2d-sdk/cores` at module scope, so every
        // project that can reach it needs its own provider: Vitest gives each inline
        // project its own Vite config, and a `plugins` entry on this file would not
        // reach them. Without sources the plugin reports an unavailable capability,
        // which is the state these tests exercise.
        plugins: [Cubism2Core()],
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        plugins: [Cubism2Core()],
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
  },
})
