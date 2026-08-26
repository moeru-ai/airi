import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    'bin/run': 'src/bin/run.ts',
    'index': 'src/index.ts',
    'server': 'src/server/index.ts',
  },
  outDir: 'dist',
  target: 'node18',
})
