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
      const result = isMarkdown(module)
        ? await renderMarkdownString(content, data)
        : await renderSFCString(content, data)
      // renderMarkdownString returns { rendered, props } instead of a plain string
      if (result && typeof result === 'object' && 'rendered' in result)
        return (result as { rendered: string }).rendered
      return result
    },
  }
}

export function velin<P = undefined>(module: string, base: string): (data?: P) => Promise<string> {
  return importVelin(module, base).render
}
