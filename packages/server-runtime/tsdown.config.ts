import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: true,
})
