import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderMarkdownString, renderSFCString } from '@velin-dev/core/render-node'

export interface VelinModule {
  render: <P>(data: P) => Promise<string>
}

function isMarkdown(module: string) {
  return module.endsWith('.md') || module.endsWith('.velin.md')
}

function relativeOf(module: string, base: string): string {
  const baseDir = dirname(fileURLToPath(base))
  return join(baseDir, module)
}

export function importVelin(module: string, base: string): VelinModule {
  return {
    render: async (data) => {
      const content = (await readFile(relativeOf(module, base))).toString('utf-8')

      if (isMarkdown(module)) {
        return renderMarkdownString(content, data)
      }

      return renderSFCString(content, data)
    },
  }
}

export function velin<P = undefined>(module: string, base: string): (data?: P) => Promise<string> {
  return importVelin(module, base).render
}
