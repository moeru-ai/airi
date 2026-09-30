import type { TestProjectInlineConfiguration } from 'vitest/config'

import Vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** Shares explicit runtimes with the root runner, which does not expand nested test projects. */
export function createAuthUiProjects(mode: string): TestProjectInlineConfiguration[] {
  const env = loadEnv(mode, import.meta.dirname, '')
  return [
    {
      root: import.meta.dirname,
      test: {
        name: 'auth-ui-node',
        env,
        include: ['src/**/*.test.ts'],
        exclude: ['src/**/*.browser.test.ts'],
      },
    },
    {
      root: import.meta.dirname,
      plugins: [VueRouter({ routesFolder: [], dts: false }), Vue()],
      test: {
        name: 'auth-ui-browser',
        env,
        include: ['src/**/*.browser.test.ts'],
        browser: {
          enabled: true,
          headless: true,
          provider: playwright(),
          instances: [{ browser: 'chromium' }],
        },
      },
    },
  ]
}

export default defineConfig(({ mode }) => ({
  test: { projects: createAuthUiProjects(mode) },
}))
