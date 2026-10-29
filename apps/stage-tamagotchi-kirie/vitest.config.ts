import { resolve } from 'node:path'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      '@proj-airi/stage-host-context': resolve(import.meta.dirname, 'src-web/src/renderer/host-context/index.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'jsdom',
          include: [
            'src-web/src/renderer/host-context/**/*.test.ts',
            'src-web/src/renderer/window-context.test.ts',
            'src-web/src/renderer/composables/useCaptionItems.test.ts',
            'src-web/src/renderer/stores/tools/builtin/widgets.test.ts',
          ],
          exclude: ['src-web/src/renderer/host-context/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src-web/src/renderer/host-context/**/*.browser.test.ts'],
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
