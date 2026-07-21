import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveSteamworksSdkDir } from './steamSdkPath'

const existsSync = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  existsSync,
}))

describe('resolveSteamworksSdkDir', () => {
  afterEach(() => {
    existsSync.mockReset()
  })

  it('returns the Steam macOS depot folder beside AIRI.app', () => {
    const gameDir = '/Steam/steamapps/common/Project AIRI'
    const execPath = `${gameDir}/AIRI.app/Contents/MacOS/AIRI`

    existsSync.mockImplementation((path: string) => {
      return path === `${gameDir}/steamworks_sdk/redistributable_bin/osx/libsteam_api.dylib`
    })

    expect(resolveSteamworksSdkDir({
      cwd: '/',
      execPath,
    })).toBe(`${gameDir}/steamworks_sdk`)
  })

  it('returns the package-root sdk folder during local dev', () => {
    const packageRoot = '/Users/dev/airi/apps/stage-tamagotchi'
    const execPath = '/Users/dev/airi/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'

    existsSync.mockImplementation((path: string) => {
      return path === `${packageRoot}/steamworks_sdk/redistributable_bin/osx/libsteam_api.dylib`
    })

    expect(resolveSteamworksSdkDir({
      cwd: packageRoot,
      execPath,
    })).toBe(`${packageRoot}/steamworks_sdk`)
  })

  it('returns null when no redistributable is found', () => {
    existsSync.mockReturnValue(false)

    expect(resolveSteamworksSdkDir({
      cwd: '/tmp',
      execPath: '/tmp/AIRI.app/Contents/MacOS/AIRI',
    })).toBeNull()
  })
})
