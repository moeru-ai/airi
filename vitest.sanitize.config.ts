import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/stage-ui/src/stores/mods/api/context-bridge-sanitize.test.ts'],
  },
})
