import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  external: ['./index.css'],
  copy: [
    { from: 'src/files', to: 'dist/files' },
    { from: 'src/index.css', to: 'dist/index.css' },
  ],
  unbundle: true,
  fixedExtension: true,
})
