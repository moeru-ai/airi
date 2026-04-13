import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  external: ['./index.css'],
  copy: [
    { from: 'src/files', to: 'dist' },
    { from: 'src/index.css', to: 'dist' },
  ],
  unbundle: true,
})
