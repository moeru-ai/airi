import { describe, expect, it } from 'vitest'
import { getDiagnostics } from './navigation'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'

describe('navigation LSP tools', () => {
  it('getDiagnostics should return errors for invalid typescript', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'airi-test-'))
    const testFile = path.resolve(workspacePath, 'temp-test-diag.ts')
    
    await fs.writeFile(testFile, 'const x: number = "string";', 'utf8')
    try {
      const result = await getDiagnostics(workspacePath, 'temp-test-diag.ts')
      expect(result.status).toBe('success')
      expect(result.diagnosticsCount).toBeGreaterThan(0)
      expect(result.diagnostics.some((d: string) => d.includes("Type 'string' is not assignable to type 'number'"))).toBe(true)
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {})
    }
  })

  it('getDiagnostics should return empty array for valid typescript', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'airi-test-'))
    const testFile = path.resolve(workspacePath, 'temp-test-diag-valid.ts')
    
    await fs.writeFile(testFile, 'export const x: number = 42;', 'utf8')
    try {
      const result = await getDiagnostics(workspacePath, 'temp-test-diag-valid.ts')
      expect(result.status).toBe('success')
      expect(result.diagnosticsCount).toBe(0)
    } finally {
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {})
    }
  })
})
