import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/strip-markdown.ts'],
  dts: true,
})
