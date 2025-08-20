import { readFile } from 'node:fs/promises'

import { renderMarkdownString, renderSFCString } from '@velin-dev/core/render-node'

import { relativeOf } from './path'

export interface VelinModule {
  render: <P>(data: P) => Promise<string>
}

function isMarkdown(module: string) {
  return module.endsWith('.md') || module.endsWith('.velin.md')
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
