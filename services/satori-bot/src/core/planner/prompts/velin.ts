import { readFile } from 'node:fs/promises'

import { relativeOf } from './path'

export interface VelinModule {
  render: <P>(data: P) => Promise<string>
}

export function importVelin(module: string, base: string): VelinModule {
  return {
    render: async (data) => {
      let content = (await readFile(relativeOf(module, base))).toString('utf-8')

      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value))
        }
      }
      return content
    },
  }
}

export function velin<P = undefined>(module: string, base: string): (data?: P) => Promise<string> {
  return importVelin(module, base).render
}
