import { defineConfig } from 'tsdown'

export default defineConfig({
  copy: [
    { from: 'src/files', to: 'dist' },
    { from: 'src/index.css', to: 'dist' },
  ],
  entry: ['src/index.ts'],
  external: ['./index.css'],
  unbundle: true,
})
