import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'packages/stage-shared/src/debug/generated/debug.swagger.json',
  output: 'packages/stage-shared/src/debug/generated/client',
})
