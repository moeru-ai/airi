import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    './index': 'src/index.ts',
  },
  dts: true,
  sourcemap: true,
  unused: true,
  fixedExtension: true,
})
