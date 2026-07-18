import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/agents/spark-notify/index.ts',
  ],
  dts: true,
})
