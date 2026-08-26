import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    'bin/run': 'src/bin/run.ts',
    'bin/runner': 'src/bin/runner.ts',
    'index': 'src/index.ts',
  },
  outDir: 'dist',
  target: 'node18',
})
