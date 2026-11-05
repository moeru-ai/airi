import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests cover the grader. `*.eval.ts` files run through vieval.
    include: ['eval/**/*.test.ts'],
  },
})
