import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: true,
})
