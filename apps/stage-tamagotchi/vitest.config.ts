import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import Info from 'unplugin-info/vite'

import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

import unoConfig from './uno.config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Info(),
    vue(),
    UnoCss({
      ...unoConfig,
      // NOTICE:
      // Disable config discovery to preserve the initial stylesheet scan below.
      // The discovered config replaces inline content through a shallow merge.
      // Source: loadConfig in node_modules/@unocss/config/dist/index.mjs uses
      // Object.assign(defaults, inlineConfig, result.config ?? {}).
      // When discovery preserves inline content.filesystem, remove configFile: false
      // and the explicit unoConfig import and spreads. Verify the shuffled browser suite.
      configFile: false,
      // Generate the initial stylesheet before parallel browser files mount.
      // Late utility extraction can resize controls during layout assertions.
      content: {
        ...unoConfig.content,
        filesystem: [
          `${import.meta.dirname}/src/**/*.vue`,
          `${import.meta.dirname}/../../packages/stage-layouts/src/**/*.vue`,
          `${import.meta.dirname}/../../packages/stage-ui/src/**/*.vue`,
          `${import.meta.dirname}/../../packages/ui/src/**/*.vue`,
        ],
      },
    }),
  ],
  test: {
    env: loadEnv('test', cwd(), ''),
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/.git/**'],
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
      {
        extends: true,
        plugins: [DownloadLive2DSDK()],
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          exclude: ['**/node_modules/**', '**/.git/**'],
          setupFiles: ['@proj-airi/stage-ui-live2d/testing/setup-browser'],
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
