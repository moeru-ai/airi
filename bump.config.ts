import { defineConfig } from 'bumpp'
import { x } from 'tinyexec'

export default defineConfig({
  recursive: true,
  commit: 'release: v%s',
  sign: false,
  push: false,
  all: true,
  execute: async () => {
    await x('bun', ['run', 'publish:packages', '--', '--dry-run'])
  },
})
