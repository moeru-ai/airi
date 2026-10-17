import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Info from 'unplugin-info/vite'

import { playwright } from '@vitest/browser-playwright'
import { mergeConfigs } from 'unocss'
import { defineConfig } from 'vitest/config'

import { sharedUnoConfig } from '../../uno.config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Info(),
    vue(),
    UnoCSS(mergeConfigs([sharedUnoConfig(), {
      configFile: false,
      // Load product styles before browser tests render their first component.
      content: { filesystem: [
        `${import.meta.dirname}/src-web/src/**/*.vue`,
        `${import.meta.dirname}/../../packages/stage-ui/src/**/*.vue`,
        `${import.meta.dirname}/../../packages/ui/src/**/*.vue`,
      ] },
    }])),
  ],
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
            'src-web/src/renderer/stores/tools/builtin/weather.test.ts',
            'src-web/src/renderer/stores/tools/builtin/widgets.test.ts',
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
            'src-web/src/renderer/composables/use-push-to-talk-shortcut.browser.test.ts',
            'src-web/src/renderer/components/inlay/voice-inlay.browser.test.ts',
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
