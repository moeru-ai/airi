import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    'src/index.ts',
    'src/agents/spark-notify/index.ts',
  ],
})
