import vue from '@vitejs/plugin-vue'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue()],
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
            'src-web/src/renderer/stores/tools/builtin/weather.test.ts',
          ],
          exclude: ['src-web/src/renderer/host-context/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: [
            'src-web/src/renderer/host-context/**/*.browser.test.ts',
            'src-web/src/renderer/components/chat-tool-renderers/weather-tool-call-widget.browser.test.ts',
          ],
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
