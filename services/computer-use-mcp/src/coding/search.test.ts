import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { findReferences } from './search'

describe('findReferences', () => {
  const cleanupPaths: string[] = []

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map(async (workspacePath) => {
      await fs.rm(workspacePath, { recursive: true, force: true })
    }))
  })

  it('finds references across project files declared in tsconfig', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'airi-search-'))
    cleanupPaths.push(workspacePath)

    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Node',
      },
      include: ['src/**/*.ts'],
    }), 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'a.ts'), [
      'export function greet() {',
      '  return "hi"',
      '}',
    ].join('\n'), 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'b.ts'), [
      'import { greet } from "./a"',
      '',
      'export const message = greet()',
    ].join('\n'), 'utf8')

    const result = await findReferences(workspacePath, 'src/a.ts', 1, 17)

    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'src/a.ts', line: 1 }),
      expect.objectContaining({ file: 'src/b.ts' }),
    ]))
  })
})
