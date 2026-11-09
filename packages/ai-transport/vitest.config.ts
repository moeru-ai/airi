import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { name: 'ai-transport', environment: 'node', include: ['src/**/*.test.ts'] } })
