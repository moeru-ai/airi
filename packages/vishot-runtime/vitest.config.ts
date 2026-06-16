import { defineConfig } from 'vitest/config'

// Minimal vitest config for the vishot-runtime package.
// Currently no tests exist in this package, so this config simply
// defines the test discovery pattern. Add tests under src/**/*.test.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    // The vishot-runtime package is a test-only workspace placeholder; there are
    // no tests here yet. Allow vitest to exit 0 when no test files match so the
    // root `test:run` script (which chains with `&&`) continues to `test-ui:run`.
    passWithNoTests: true,
  },
})
