import { join } from 'node:path'
import { cwd, env } from 'node:process'

import Vue from '@vitejs/plugin-vue'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

function BuildInfoTestPlugin() {
  return {
    name: 'stage-ui-test-build-info',
    resolveId(id: string) {
      if (id === '~build/git' || id === '~build/time')
        return `\0${id}`
    },
    load(id: string) {
      if (id === '\0~build/git') {
        return [
          'export const abbreviatedSha = "test-sha"',
          'export const branch = "test-branch"',
        ].join('\n')
      }

      if (id === '\0~build/time') {
        return 'export default "2026-05-07T00:00:00.000Z"'
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  return {
    root: import.meta.dirname,
    plugins: [
      BuildInfoTestPlugin(),
    ],
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.browser.test.ts'],
            env: loadEnv(mode, join(cwd(), 'packages', 'stage-ui'), ''),
          },
        },
        {
          extends: true,
          plugins: [
            Vue(),
          ],
          test: {
            name: 'browser',
            include: ['**/*.browser.{spec,test}.ts'],
            exclude: ['**/node_modules/**'],
            browser: {
              enabled: true,
              // NOTICE: CI uses the GitHub-hosted runner's preinstalled Google Chrome.
              // Playwright's Chromium installer is currently hanging after the download
              // reaches 100%, so CI selects Chrome by channel while local runs keep the
              // default bundled Chromium behavior.
              provider: playwright(env.CI ? { launchOptions: { channel: 'chrome' } } : undefined),
              instances: [
                { browser: 'chromium' },
              ],
            },
          },
        },
      ],
    },
  }
})
