import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests cover the evaluators and the adapters. `*.eval.ts` files call paid models and run through vieval.
    include: ['eval/**/*.test.ts'],
  },
})
