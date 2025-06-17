import { cwd } from 'node:process'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  console.log('mode', mode)

  return {
    test: {
      // mode defines what ".env.{mode}" file to choose if exists
      env: loadEnv(mode, cwd(), ''),
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
      ],
    },
  }
})
