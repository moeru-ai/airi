import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./ai-transport-smoke.ts', './ai-transport-smoke-preload.ts'],
  outDir: '../out/ai-transport-smoke',
  format: 'cjs',
  dts: false,
  deps: {
    neverBundle: ['electron', '@proj-airi/ai-transport'],
    alwaysBundle: [/^@proj-airi\/(?!ai-transport$)/, /^@moeru\//, /^valibot$/, /^destr$/, /^es-toolkit/],
  },
})
