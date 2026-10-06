// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import ts from 'typescript'

import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

function createRequest(granted: boolean, requested = false) {
  const source = readFileSync(new URL('./permissions-panel.vue', import.meta.url), 'utf8')
  const script = source.split('<script setup lang="ts">')[1].split('</script>')[0]
  const file = ts.createSourceFile('permissions-panel.ts', script, ts.ScriptTarget.Latest)
  const functions = file.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && ['refreshMicrophonePermission', 'requestMicrophonePermission'].includes(statement.name?.text ?? ''))
  expect(functions).toHaveLength(2)
  const code = ts.transpileModule(functions.map(statement => statement.getText(file)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ESNext },
  }).outputText
  const nativeGranted = shallowRef(false)
  const requesting = shallowRef(false)
  const permissionRequested = shallowRef(requested)
  const askPermission = vi.fn(async () => {})
  const openSettings = vi.fn(async () => {})
  const requestNative = vi.fn(async () => ({ granted }))
  // This source fixture executes the two production functions without mounting or mocking Pinia.
  // The native channel and browser permission operation are the external boundaries.
  const request = runInNewContext(`${code}\nrequestMicrophonePermission`, {
    isKirieAndroid: true,
    isNativePlatform: true,
    isAndroid: true,
    platformMicrophonePermissionGranted: nativeGranted,
    requestingMicrophonePermission: requesting,
    microphonePermissionRequested: permissionRequested,
    checkKirieAndroidPermission: async () => ({ granted: false }),
    requestKirieAndroidPermission: requestNative,
    openKirieAndroidPermissionSettings: openSettings,
    audioDeviceStore: { askPermission },
  }) as () => Promise<void>
  return { request, nativeGranted, requesting, permissionRequested, askPermission, openSettings, requestNative }
}

// Source: useAudioDevice.askPermission() updates VueUse's shared permission ref and awaits enumeration.
describe('kirie microphone permission panel', () => {
  it('awaits the shared browser permission operation after a native grant', async () => {
    const fixture = createRequest(true)
    const browser = Promise.withResolvers<void>()
    fixture.askPermission.mockImplementation(() => browser.promise)
    const finished = fixture.request()
    await vi.waitFor(() => expect(fixture.askPermission).toHaveBeenCalledOnce())
    expect(fixture.requesting.value).toBe(true)
    expect(fixture.nativeGranted.value).toBe(false)
    browser.resolve()
    await finished
    expect(fixture.nativeGranted.value).toBe(true)
    expect(fixture.requesting.value).toBe(false)
    expect(fixture.permissionRequested.value).toBe(true)
  })

  it('preserves native denial and the requested flag without a second prompt', async () => {
    const fixture = createRequest(false)
    await fixture.request()
    expect(fixture.askPermission).not.toHaveBeenCalled()
    expect(fixture.nativeGranted.value).toBe(false)
    expect(fixture.permissionRequested.value).toBe(true)
  })

  it('opens Settings after a previous request', async () => {
    const fixture = createRequest(false, true)
    await fixture.request()
    expect(fixture.openSettings).toHaveBeenCalledWith('microphone')
    expect(fixture.requestNative).not.toHaveBeenCalled()
    expect(fixture.askPermission).not.toHaveBeenCalled()
  })
})
