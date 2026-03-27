import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'bin/run': 'src/bin/run.ts',
    'vite-plugin': 'src/vite-plugin.ts',
    'vite-wrapper-config': 'src/vite-wrapper-config.ts',
  },
  target: 'node18',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
})
