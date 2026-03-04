// https://github.com/unocss/unocss/blob/dba521e377887ed2b3b38dc86f36d4f292230ac8/packages-integrations/vscode/scripts/publish.ts

import process from 'node:process'

import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exec } from 'tinyexec'

import { packageJSONForVSCode } from './shared'

const dir = typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url))
const root = dirname(dir)

async function publish() {
  const { restore, isPreview } = await packageJSONForVSCode('airi-vscode')
  const pkgPath = join(root, 'package.json')
  const rawJSON = await readFile(pkgPath, 'utf-8')

  const pkg = JSON.parse(rawJSON)

  if (isPreview)
    pkg.preview = true
  else
    delete pkg.preview

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')

  await rm(join(root, 'LICENSE'), { force: true }).catch(() => {})
  await copyFile(join(root, '..', '..', 'LICENSE'), join(root, 'LICENSE'))

  try {
    {
      // eslint-disable-next-line no-console
      console.log('\nPublish to VSCE...\n')
      const vsceArgs = ['@vscode/vsce', 'publish', '--no-dependencies', '-p', process.env.VSCE_TOKEN!]
      if (isPreview)
        vsceArgs.push('--pre-release')

      const execPublish = exec('pnpx', vsceArgs, { nodeOptions: { cwd: root } })
      for await (const line of execPublish) {
      // eslint-disable-next-line no-console
        console.log(line)
      }
    }
    {
      // eslint-disable-next-line no-console
      console.log('\nPublish to OVSE...\n')
      const ovseArgs = ['ovsx', 'publish', '--no-dependencies', '-p', process.env.OVSX_TOKEN!]
      if (isPreview)
        ovseArgs.push('--pre-release')

      const execPublish = exec('pnpx', ovseArgs, { nodeOptions: { cwd: root } })
      for await (const line of execPublish) {
      // eslint-disable-next-line no-console
        console.log(line)
      }
    }
  }
  finally {
    await restore()
  }
}

publish()
