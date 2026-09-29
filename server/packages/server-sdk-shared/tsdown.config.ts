import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    contacts: 'src/contacts.ts',
    v2: 'src/v2.ts',
  },
  sourcemap: true,
  unused: true,
  inlineOnly: false,
})
