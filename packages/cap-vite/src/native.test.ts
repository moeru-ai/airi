import { describe, expect, it, vi } from 'vitest'

import { hasCapacitorTargetArg, parseCapacitorPlatform, pickServerUrl, resolveCapRunArgs, shouldRestartForNativeChange } from './native'

describe('parseCapacitorPlatform', () => {
  it('accepts supported platforms', () => {
    expect(parseCapacitorPlatform('ios')).toBe('ios')
    expect(parseCapacitorPlatform('android')).toBe('android')
  })

  it('rejects unsupported platforms', () => {
    expect(parseCapacitorPlatform('web')).toBeNull()
    expect(parseCapacitorPlatform(undefined)).toBeNull()
  })
})

describe('pickServerUrl', () => {
  it('prefers network urls over local urls', () => {
    expect(pickServerUrl({
      resolvedUrls: {
        local: ['http://127.0.0.1:5173/'],
        network: ['http://192.168.1.10:5173/'],
      },
    } as any).toString()).toBe('http://192.168.1.10:5173/')
  })

  it('falls back to local urls when no network url exists', () => {
    expect(pickServerUrl({
      resolvedUrls: {
        local: ['http://127.0.0.1:5173/'],
      },
    } as any).toString()).toBe('http://127.0.0.1:5173/')
  })

  it('throws when vite did not expose any reachable url', () => {
    expect(() => pickServerUrl({
      resolvedUrls: {
        local: [],
        network: [],
      },
    } as any)).toThrow('Vite did not expose a reachable dev server URL.')
  })
})

describe('resolveCapRunArgs', () => {
  it('keeps an explicit --target argument untouched', async () => {
    await expect(resolveCapRunArgs(
      ['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'],
      { CAPACITOR_DEVICE_ID_IOS: 'ignored-device' },
    )).resolves.toEqual(['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'])
  })

  it('injects --target from CAPACITOR_DEVICE_ID_ANDROID when it is missing', async () => {
    await expect(resolveCapRunArgs(
      ['android', '--flavor', 'release'],
      { CAPACITOR_DEVICE_ID_ANDROID: 'emulator-5554' },
    )).resolves.toEqual(['android', '--target', 'emulator-5554', '--flavor', 'release'])
  })

  it('injects --target from CAPACITOR_DEVICE_ID_IOS when it is missing', async () => {
    await expect(resolveCapRunArgs(
      ['ios', '--scheme', 'AIRI'],
      { CAPACITOR_DEVICE_ID_IOS: 'iPhone 16 Pro' },
    )).resolves.toEqual(['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'])
  })

  it('does not use the other platform device id', async () => {
    const listTargets = vi.fn(async () => [
      { id: 'ios-device' },
    ])

    await expect(resolveCapRunArgs(
      ['ios'],
      { CAPACITOR_DEVICE_ID_ANDROID: 'emulator-5554' },
      listTargets,
    )).resolves.toEqual(['ios', '--target', 'ios-device'])
  })

  it('supports the --target=value form when checking existing args', async () => {
    expect(hasCapacitorTargetArg(['android', '--target=emulator-5554'])).toBe(true)
    await expect(resolveCapRunArgs(
      ['android', '--target=emulator-5554', '--flavor', 'release'],
      { CAPACITOR_DEVICE_ID_ANDROID: 'ignored-device' },
    )).resolves.toEqual(['android', '--target=emulator-5554', '--flavor', 'release'])
  })

  it('injects the first listed device when --target and platform device env are missing', async () => {
    const listTargets = vi.fn(async () => [
      { id: 'first-device' },
      { id: 'second-device' },
    ])

    await expect(resolveCapRunArgs(
      ['android', '--flavor', 'release'],
      {},
      listTargets,
    )).resolves.toEqual(['android', '--target', 'first-device', '--flavor', 'release'])
    expect(listTargets).toHaveBeenCalledWith('android')
  })

  it('prefers platform device env over the first listed device', async () => {
    const listTargets = vi.fn(async () => [
      { id: 'first-device' },
    ])

    await expect(resolveCapRunArgs(
      ['ios'],
      { CAPACITOR_DEVICE_ID_IOS: 'configured-device' },
      listTargets,
    )).resolves.toEqual(['ios', '--target', 'configured-device'])
    expect(listTargets).not.toHaveBeenCalled()
  })

  it('throws when no default device target is available', async () => {
    const listTargets = vi.fn(async () => [])

    await expect(resolveCapRunArgs(
      ['ios'],
      {},
      listTargets,
    )).rejects.toThrow('No ios devices or simulators found.')
  })
})

describe('shouldRestartForNativeChange', () => {
  it('restarts for native source files inside the selected platform directory', () => {
    expect(shouldRestartForNativeChange('/repo/app/ios/App/AppDelegate.swift', 'ios', '/repo/app')).toBe(true)
    expect(shouldRestartForNativeChange('/repo/app/android/app/src/main/AndroidManifest.xml', 'android', '/repo/app')).toBe(true)
  })

  it('ignores web-side files and generated native output', () => {
    expect(shouldRestartForNativeChange('/repo/app/src/main.ts', 'ios', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/ios/App/CapApp-SPM/Package.swift', 'ios', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/build/generated/file.kt', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/capacitor.settings.gradle', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/app/capacitor.build.gradle', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/app/src/main/assets/public/index.html', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/app/src/main/assets/capacitor.plugins.json', 'android', '/repo/app')).toBe(false)
    expect(shouldRestartForNativeChange('/repo/app/android/app/src/main/res/xml/config.xml', 'android', '/repo/app')).toBe(false)
  })

  it('ignores capacitor config json updates', () => {
    expect(shouldRestartForNativeChange('/repo/app/android/capacitor.config.json', 'android', '/repo/app')).toBe(false)
  })
})
