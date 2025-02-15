import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { importDirectory } from '@iconify/tools'
import { getPackageInfo, isPackageExists } from 'local-pkg'
import { defineBuildConfig } from 'unbuild'

import packageJSON from './package.json'

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

      await writeFile('./dist/metadata.json', JSON.stringify({ categories: iconSetData.categories }, null, 2), { encoding: 'utf8' })
      await writeFile('./dist/icons.json', JSON.stringify(iconJSONData, null, 2), { encoding: 'utf8' })
      await writeFile('./dist/chars.json', JSON.stringify({}, null, 2), { encoding: 'utf8' })
      await writeFile('./dist/info.json', JSON.stringify({
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
        height: 32,
        displayHeight: 16,
        category: 'Logos 16px / 32px',
        tags: [
          'AI',
          'Models',
          'LLM',
          'Lobe',
        ],
        palette: false,
      }, null, 2), { encoding: 'utf8' })
    },
  },
})
