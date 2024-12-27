import { defineConfig } from 'bumpp'

export default defineConfig({
  recursive: true,
  commit: 'release: v%s',
  sign: true,
  push: false,
})
