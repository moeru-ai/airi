import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@proj-airi/stage-ui-live2d',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
})
