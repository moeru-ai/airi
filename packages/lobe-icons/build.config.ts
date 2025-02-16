import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importDirectory } from '@iconify/tools'
import { getPackageInfo, isPackageExists } from 'local-pkg'
import { defineBuildConfig } from 'unbuild'

import packageJSON from './package.json'

function json(any: any) {
  return JSON.stringify(any, null, 2)
}

export default defineBuildConfig({
  entries: [
    { builder: 'rollup', input: 'src/index.ts', outDir: 'dist', declaration: true },
    { builder: 'mkdist', input: './src', outDir: './dist', pattern: ['**/*.json'] },
  ],
  externals: [
    './metadata.json',
    './icons.json',
    './chars.json',
    './info.json',
  ],
  rollup: {
    emitCJS: true,
  },
  declaration: true,
  sourcemap: false,
  failOnWarn: false,
  hooks: {
    'build:done': async () => {
      if (!isPackageExists('@lobehub/icons-static-svg'))
        throw new Error('Package @lobehub/icons-static-svg not found')

      const pkg = await getPackageInfo('@lobehub/icons-static-svg')
      if (!pkg)
        throw new Error('Package @lobehub/icons-static-svg not found')

      const iconSetData = await importDirectory(join(pkg.rootPath, 'icons'), { prefix: 'lobe-icons', ignoreImportErrors: 'warn' })
      const iconJSONData = iconSetData.export()

      await writeFile('./dist/metadata.json', json({ categories: iconSetData.categories }), { encoding: 'utf8' })
      await writeFile('./dist/icons.json', json(iconJSONData), { encoding: 'utf8' })
      await writeFile('./dist/chars.json', json({}), { encoding: 'utf8' })
      await writeFile('./dist/info.json', json({
        prefix: 'lobe-icons',
        name: 'Lobe Icons',
        total: Object.keys(iconJSONData.icons).length,
        version: packageJSON.version,
        author: {
          name: packageJSON.author.name,
          url: packageJSON.author.url,
        },
        license: {
          title: 'MIT',
          spdx: 'MIT',
        },
        samples: [
          'openai',
          'deepseek',
          'claude',
        ],
        height: 20,
        displayHeight: 20,
        category: 'Logos 20px',
        tags: [
          'AI',
          'Models',
          'LLM',
          'Lobe',
        ],
        palette: false,
      }), { encoding: 'utf8' })
    },
  },
})
