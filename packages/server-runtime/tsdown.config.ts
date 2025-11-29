import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'bin/run': 'src/bin/run.ts',
  },
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: true,
})
