import path from 'node:path'

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { MinecraftRuntimeConfigManager } from './runtime-config'

function createTempDir() {
  return mkdtempSync(path.join(tmpdir(), 'minecraft-runtime-config-'))
}

describe('minecraftRuntimeConfigManager', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads bot config with env.local overriding saved config and env', () => {
    const cwd = createTempDir()
    tempDirs.push(cwd)

    writeFileSync(path.join(cwd, '.env'), [
      'BOT_HOSTNAME=env.example.com',
      'BOT_PORT=25565',
      'BOT_USERNAME=env-bot',
    ].join('\n'))
    writeFileSync(path.join(cwd, '.env.local'), [
      'BOT_HOSTNAME=local.example.com',
      'BOT_USERNAME=local-bot',
    ].join('\n'))
    mkdirSync(path.join(cwd, 'data'), { recursive: true })
    writeFileSync(path.join(cwd, 'data', 'minecraft-config.json'), JSON.stringify({
      enabled: true,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    }, null, 2))

    const manager = new MinecraftRuntimeConfigManager({ cwd })
    const snapshot = manager.load()

    expect(snapshot.editableConfig).toEqual({
      enabled: true,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    })
    expect(snapshot.effectiveBotConfig).toMatchObject({
      host: 'local.example.com',
      port: 24444,
      username: 'local-bot',
    })
  })

  it('persists only the UI-managed editable config', () => {
    const cwd = createTempDir()
    tempDirs.push(cwd)

    writeFileSync(path.join(cwd, '.env'), [
      'BOT_HOSTNAME=env.example.com',
      'BOT_PORT=25565',
      'BOT_USERNAME=env-bot',
      'BOT_VERSION=1.21',
    ].join('\n'))

    const manager = new MinecraftRuntimeConfigManager({ cwd })
    manager.load()

    const snapshot = manager.save({
      enabled: false,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    })

    expect(snapshot.editableConfig).toEqual({
      enabled: false,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    })
    expect(snapshot.effectiveBotConfig).toMatchObject({
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
      version: '1.21',
    })

    const savedFile = JSON.parse(readFileSync(path.join(cwd, 'data', 'minecraft-config.json'), 'utf8'))
    expect(savedFile).toEqual({
      enabled: false,
      host: 'saved.example.com',
      port: 24444,
      username: 'saved-bot',
    })
  })

  it('falls back to the default port when env config contains an empty port value', () => {
    const cwd = createTempDir()
    tempDirs.push(cwd)

    writeFileSync(path.join(cwd, '.env'), [
      'BOT_HOSTNAME=env.example.com',
      'BOT_PORT=',
      'BOT_USERNAME=env-bot',
    ].join('\n'))

    const manager = new MinecraftRuntimeConfigManager({ cwd })
    const snapshot = manager.load()

    expect(snapshot.editableConfig).toEqual({
      enabled: true,
      host: 'env.example.com',
      port: 25565,
      username: 'env-bot',
    })
    expect(snapshot.effectiveBotConfig.port).toBe(25565)
  })

  it('strips matching quotes from env values like dotenv does', () => {
    const cwd = createTempDir()
    tempDirs.push(cwd)

    writeFileSync(path.join(cwd, '.env.local'), [
      'BOT_HOSTNAME=\'127.0.0.1\'',
      'BOT_PORT=\'25565\'',
      'BOT_USERNAME=\'quoted-bot\'',
      'BOT_VERSION=\'1.21.8\'',
    ].join('\n'))

    const manager = new MinecraftRuntimeConfigManager({ cwd })
    const snapshot = manager.load()

    expect(snapshot.effectiveBotConfig).toMatchObject({
      host: '127.0.0.1',
      port: 25565,
      username: 'quoted-bot',
      version: '1.21.8',
    })
  })
})
