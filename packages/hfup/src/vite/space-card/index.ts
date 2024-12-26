import type { Plugin, ResolvedConfig } from 'vite'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defu } from 'defu'
import grayMatter from 'gray-matter'

import { exists } from '../../utils/fs'
import { type License, licenseValues, type SpaceConfiguration } from './types'

// Please find the documentation at:
// Spaces Configuration Reference
// https://huggingface.co/docs/hub/spaces-config-reference
// https://huggingface.co/docs/hub/model-cards#model-card-metadata
export function SpaceCard(configuration?: SpaceConfiguration): Plugin {
  let _config: ResolvedConfig
  const _configuration = defu<SpaceConfiguration, SpaceConfiguration[]>(
    configuration,
    {
      emoji: '🚀',
      sdk: 'static',
      pinned: false,
      license: 'unknown',
    },
  )
  let packageJSON: Record<string, any> = {}
  let readme = ''

  return {
    name: 'huggingspace:readme',
    async configResolved(config) {
      _config = config

      const rootPackageJSONPath = join(_config.root, 'package.json')
      if (await exists(rootPackageJSONPath)) {
        const rootPackageJSONContent = await readFile(rootPackageJSONPath, 'utf-8')
        packageJSON = JSON.parse(rootPackageJSONContent)
      }

      const rootReadmePaths = [
        join(_config.root, 'README.md'),
        join(_config.root, 'readme.md'),
        join(_config.root, 'README.markdown'),
        join(_config.root, 'readme.markdown'),
        join(_config.root, 'README'),
        join(_config.root, 'readme'),
      ]
      for (const rootReadmePath of rootReadmePaths) {
        if (await exists(rootReadmePath)) {
          const readReadme = await readFile(rootReadmePath, 'utf-8')
          const { content } = grayMatter(readReadme)
          readme = content
        }
      }

      if (_configuration.title == null) {
        if (packageJSON == null) {
          throw new Error(`\`title\` is required when \`package.json\` does not exist in the root directory (${rootPackageJSONPath})`)
        }
        if (!packageJSON.name) {
          throw new Error(`\`title\` is required when \`name\` does not exist in the root package.json`)
        }

        _configuration.title = packageJSON.name
      }

      if (_configuration.license == null) {
        if (packageJSON == null) {
          throw new Error(`\`license\` is required when \`package.json\` does not exist in the root directory (${rootPackageJSONPath})`)
        }
        if (!packageJSON.license) {
          throw new Error(`\`license\` is required when \`license\` does not exist in the root package.json`)
        }

        const license = String(packageJSON.license).toLowerCase()
        if (!(licenseValues.includes(license))) {
          throw new Error(`Auto discovered license \`${license}\` in \`package.json\` is not supported. Must be one of licenses: ${licenseValues.join(', ')} to specified in \`configuration\` argument`)
        }

        _configuration.license = license as License
      }

      if (_configuration.sdk == null) {
        _configuration.sdk = 'static'
      }

      if (_configuration.short_description && _configuration.short_description.length > 60) {
        throw new Error('short_description must be less or equal to 60 characters')
      }
    },
    async generateBundle() {
      if (readme == null) {
        readme = `# ${_configuration.title}`
      }

      this.emitFile({
        type: 'asset',
        fileName: 'README.md',
        source: grayMatter.stringify({ content: `\n${readme}` }, _configuration),
      })
    },
  }
}
