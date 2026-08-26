import { cwd } from 'node:process'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  console.info('mode', mode)

  return {
    test: {
      // mode defines what ".env.{mode}" file to choose if exists
      env: loadEnv(mode, cwd(), ''),
      projects: [
        {
          extends: true,
          test: {
            environment: 'node',
            exclude: ['**/*.browser.{spec,test}.ts', '**/node_modules/**'],
            include: ['**/*.{spec,test}.ts'],
            name: 'node',
          },
        },
      ],
    },
  }
})
