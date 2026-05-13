import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFilePath)
const packageJsonPath = resolve(currentDirectory, '../../package.json')

function readExports() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    exports: Record<string, string>
  }
  return packageJson.exports
}

describe('stage-ui exports contract', () => {
  it('keeps the exported subpath key set stable', () => {
    const exportsMap = readExports()

    expect(Object.keys(exportsMap).sort()).toEqual([
      '.',
      './components',
      './components/*',
      './components/scenarios/chat',
      './components/scenarios/settings/model-settings',
      './components/scenes',
      './composables',
      './composables/*',
      './constants',
      './constants/*',
      './libs',
      './libs/*',
      './libs/inference',
      './libs/inference/adapters/*',
      './stores',
      './stores/*',
      './stores/analytics',
      './stores/analytics/posthog',
      './stores/analytics/privacy-policy',
      './stores/character',
      './stores/character/orchestrator/spark-notify-agent',
      './stores/mcp-tool-bridge',
      './stores/modules/vision',
      './stores/providers/aliyun',
      './stores/settings',
      './stores/settings/analytics',
      './tools/mcp',
      './types',
      './types/*',
      './utils',
      './utils/tts',
      './workers',
      './workers/*',
      './workers/vad',
    ])
  })

  it('keeps critical store and type mappings unchanged', () => {
    const exportsMap = readExports()

    expect(exportsMap['./stores']).toBe('./src/stores/index.ts')
    expect(exportsMap['./stores/*']).toBe('./src/stores/*.ts')
    expect(exportsMap['./tools/mcp']).toBe('./src/tools/mcp.ts')
    expect(exportsMap['./types']).toBe('./src/types/index.ts')
    expect(exportsMap['./types/*']).toBe('./src/types/*.ts')
  })
})
