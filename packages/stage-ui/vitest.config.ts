import { join } from 'node:path'
import { cwd } from 'node:process'

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
              provider: playwright(),
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
