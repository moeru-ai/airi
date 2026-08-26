import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: {
    'bin/run': 'src/bin/run.ts',
    'index': 'src/index.ts',
    'vite-plugin': 'src/vite-plugin.ts',
    'vite-wrapper-config': 'src/vite-wrapper-config.ts',
  },
  outDir: 'dist',
  sourcemap: true,
  target: 'node18',
})
