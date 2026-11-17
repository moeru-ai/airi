import type { ExtensionManifestV2 } from './shared/types'

import { describe, expect, it } from 'vitest'

import { checkExtensionActivation } from '.'
import { checkExtensionActivation as checkNodeExtensionActivation } from './runtimes/node'
import { checkExtensionActivation as checkWebExtensionActivation } from './runtimes/web'

function createManifest(
  id: string,
  kits?: ExtensionManifestV2['kits'],
): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id,
    version: '1.0.0',
    engines: {
      airi: '^1.0.0',
      runtimes: ['electron'],
    },
    entrypoints: {
      electron: './extension.mjs',
    },
    permissions: {},
    kits,
  }
}

describe('checkExtensionActivation', () => {
  it('is available through Node and Web package entrypoints', () => {
    expect(checkNodeExtensionActivation).toBe(checkExtensionActivation)
    expect(checkWebExtensionActivation).toBe(checkExtensionActivation)
  })

  it('accepts a required Kit without a Provider', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.missing', version: '^1.0.0' }],
    })

    expect(checkExtensionActivation({
      installedManifests: [consumer],
      enabledExtensionIds: [consumer.id],
      runtime: 'electron',
      airiVersion: '1.0.0',
    })).toEqual([])
  })

  it('rejects an enabled Extension that is not installed', () => {
    expect(checkExtensionActivation({
      installedManifests: [],
      enabledExtensionIds: ['missing-extension'],
      runtime: 'electron',
      airiVersion: '1.0.0',
    })).toEqual([{
      code: 'enabled-extension-not-installed',
      extensionIds: ['missing-extension'],
      message: 'Enabled Extension "missing-extension" is not installed.',
    }])
  })

  it('rejects an Extension that does not support the Host runtime', () => {
    const extension = createManifest('electron-extension')

    expect(checkExtensionActivation({
      installedManifests: [extension],
      enabledExtensionIds: [extension.id],
      runtime: 'node',
      airiVersion: '1.0.0',
    })).toEqual([{
      code: 'incompatible-runtime',
      extensionIds: ['electron-extension'],
      message: 'Extension "electron-extension" does not support runtime "node".',
    }])
  })

  it('rejects an Extension that does not support the AIRI version', () => {
    const extension = createManifest('future-extension')
    extension.engines.airi = '^2.0.0'

    expect(checkExtensionActivation({
      installedManifests: [extension],
      enabledExtensionIds: [extension.id],
      runtime: 'electron',
      airiVersion: '1.5.0',
    })).toEqual([{
      code: 'incompatible-airi-version',
      extensionIds: ['future-extension'],
      requestedVersion: '^2.0.0',
      providerVersion: '1.5.0',
      message: 'Extension "future-extension" requires AIRI ^2.0.0, but the Host runs 1.5.0.',
    }])
  })

  it('rejects duplicate installed Extension ids', () => {
    const firstManifest = createManifest('duplicate-extension')
    const secondManifest = createManifest('duplicate-extension')
    secondManifest.version = '2.0.0'

    expect(checkExtensionActivation({
      installedManifests: [secondManifest, firstManifest],
      enabledExtensionIds: [firstManifest.id],
      runtime: 'electron',
      airiVersion: '1.0.0',
    })).toEqual([{
      code: 'duplicate-installed-extension',
      extensionIds: ['duplicate-extension'],
      message: 'Installed Extension id "duplicate-extension" appears more than once.',
    }])
  })

  it('returns the same diagnostics for reordered duplicate installed manifests', () => {
    const plainManifest = createManifest('duplicate-extension')
    const conflictingManifest = createManifest('duplicate-extension', {
      provides: [{ id: 'dev.airi.host-example', version: '1.0.0', exposure: 'local-only' }],
    })
    const check = (installedManifests: readonly ExtensionManifestV2[]) => checkExtensionActivation({
      installedManifests,
      enabledExtensionIds: ['duplicate-extension'],
      runtime: 'electron',
      airiVersion: '1.0.0',
    })

    const firstResult = check([plainManifest, conflictingManifest])

    expect(firstResult).toEqual(check([conflictingManifest, plainManifest]))
    expect(firstResult).toEqual([{
      code: 'duplicate-installed-extension',
      extensionIds: ['duplicate-extension'],
      message: 'Installed Extension id "duplicate-extension" appears more than once.',
    }])
  })
})
