import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { generate } from 'vscode-ext-gen'

import { packageJSONForVSCode } from './shared'

async function run() {
  const { restore, json } = await packageJSONForVSCode('airi-vscode')
  const generated = generate(json, { extensionScope: 'airi-vscode' })

  try {
    await rm(join(import.meta.dirname, 'src', 'generated'), { force: true })
  }
  catch {
  }

  await mkdir(join(import.meta.dirname, 'src', 'generated'), { recursive: true })
  await writeFile(join(import.meta.dirname, 'src', 'generated', 'meta.ts'), generated.dts, 'utf-8')
  await restore()
}

run()
