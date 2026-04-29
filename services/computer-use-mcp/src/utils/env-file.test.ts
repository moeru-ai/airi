import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { maskEnvValuePreview, readEnvValue } from './env-file'

describe('readEnvValue', () => {
  it('returns the first matching key from an env file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'airi-env-read-'))
    const envPath = join(dir, '.env')

    try {
      await writeFile(envPath, [
        '# comment',
        'FOO=bar',
        'DISCORD_BOT_TOKEN="real-secret-token"',
      ].join('\n'))

      await expect(readEnvValue({
        filePath: envPath,
        keys: ['AIRI_E2E_DISCORD_TOKEN', 'DISCORD_BOT_TOKEN'],
      })).resolves.toEqual({
        filePath: envPath,
        key: 'DISCORD_BOT_TOKEN',
        value: 'real-secret-token',
      })
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects placeholder values by default', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'airi-env-read-'))
    const envPath = join(dir, '.env')

    try {
      await writeFile(envPath, 'AIRI_E2E_DISCORD_TOKEN=replace-with-your-discord-bot-token\n')

      await expect(readEnvValue({
        filePath: envPath,
        keys: ['AIRI_E2E_DISCORD_TOKEN'],
      })).rejects.toThrow(/placeholder\/template value/)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('maskEnvValuePreview', () => {
  it('masks the middle of long values', () => {
    expect(maskEnvValuePreview('discord-super-secret-token')).toMatch(/^disc\*+oken$/)
  })
})
