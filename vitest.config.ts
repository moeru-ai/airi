import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      // Scripts that GitHub Actions run. They belong to no package.
      {
        test: {
          name: 'github-scripts',
          include: ['.github/scripts/**/*.test.ts'],
        },
      },
    ],
  },
})
