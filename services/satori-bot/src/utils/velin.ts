import { readFile } from 'node:fs/promises'

import { relativeOf } from './path'

export interface VelinModule {
  render: <P>(data: P) => Promise<string>
}

export function importVelin(module: string, base: string): VelinModule {
  return {
    render: async (_data) => {
      // 直接读取文件内容，不使用 Velin 渲染
      // 因为 Velin 的 renderMarkdownString 会尝试处理 SFC，导致 Vue 模块导入错误
      const content = (await readFile(relativeOf(module, base))).toString('utf-8')
      return content
    },
  }
}

export function velin<P = undefined>(module: string, base: string): (data?: P) => Promise<string> {
  return importVelin(module, base).render
}
