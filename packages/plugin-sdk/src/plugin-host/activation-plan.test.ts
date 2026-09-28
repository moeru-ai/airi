import type { ExtensionManifestV2 } from './shared/types'

import { describe, expect, it } from 'vitest'

import { planExtensionActivation } from '.'
import { planExtensionActivation as planNodeExtensionActivation } from './runtimes/node'
import { planExtensionActivation as planWebExtensionActivation } from './runtimes/web'

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

describe('planExtensionActivation', () => {
  it('is available through Node and Web package entrypoints', () => {
    expect(planNodeExtensionActivation).toBe(planExtensionActivation)
    expect(planWebExtensionActivation).toBe(planExtensionActivation)
  })

  it('loads a required Provider before its Consumer', () => {
    const provider = createManifest('provider-extension', {
      provides: [{
        id: 'dev.airi.example',
        version: '1.2.0',
        exposure: 'local-only',
      }],
    })
    const consumer = createManifest('consumer-extension', {
      uses: [{
        id: 'dev.airi.example',
        version: '^1.0.0',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer, provider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [consumer.id, provider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['consumer-extension', 'provider-extension'],
        targetLoadedExtensionIds: ['consumer-extension', 'provider-extension'],
        unloadOrder: [],
        loadOrder: ['provider-extension', 'consumer-extension'],
        restartExtensionIds: [],
        resolutions: [{
          consumerExtensionId: 'consumer-extension',
          kitId: 'dev.airi.example',
          requestedVersion: '^1.0.0',
          optional: false,
          provider: {
            kind: 'extension',
            extensionId: 'provider-extension',
            version: '1.2.0',
          },
        }],
      },
    })
  })

  it('uses global Extension ID order when newly ready nodes compete with unrelated nodes', () => {
    const provider = createManifest('a-provider', {
      provides: [{
        id: 'dev.airi.example',
        version: '1.0.0',
        exposure: 'local-only',
      }],
    })
    const consumer = createManifest('b-consumer', {
      uses: [{
        id: 'dev.airi.example',
        version: '^1.0.0',
      }],
    })
    const independent = createManifest('z-independent')

    const result = planExtensionActivation({
      installedManifests: [independent, consumer, provider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [independent.id, consumer.id, provider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.plan.loadOrder).toEqual([
      'a-provider',
      'b-consumer',
      'z-independent',
    ])
  })

  it('rejects a missing required Kit', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{
        id: 'dev.airi.missing',
        version: '^1.0.0',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer],
      loadedManifests: [],
      proposedEnabledExtensionIds: [consumer.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'missing-required-kit',
        extensionIds: ['consumer-extension'],
        kitId: 'dev.airi.missing',
        requestedVersion: '^1.0.0',
        message: 'Extension "consumer-extension" requires missing Kit "dev.airi.missing" (^1.0.0).',
      }],
    })
  })

  it('resolves a required Kit from the Host', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{
        id: 'dev.airi.host-example',
        version: '^2.0.0',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer],
      loadedManifests: [],
      proposedEnabledExtensionIds: [consumer.id],
      hostProvidedKits: [{ id: 'dev.airi.host-example', version: '2.1.0' }],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['consumer-extension'],
        targetLoadedExtensionIds: ['consumer-extension'],
        unloadOrder: [],
        loadOrder: ['consumer-extension'],
        restartExtensionIds: [],
        resolutions: [{
          consumerExtensionId: 'consumer-extension',
          kitId: 'dev.airi.host-example',
          requestedVersion: '^2.0.0',
          optional: false,
          provider: { kind: 'host', version: '2.1.0' },
        }],
      },
    })
  })

  it('rejects duplicate Extension Providers for one Kit', () => {
    const firstProvider = createManifest('first-provider', {
      provides: [{
        id: 'dev.airi.example',
        version: '1.0.0',
        exposure: 'local-only',
      }],
    })
    const secondProvider = createManifest('second-provider', {
      provides: [{
        id: 'dev.airi.example',
        version: '2.0.0',
        exposure: 'local-only',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [secondProvider, firstProvider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [secondProvider.id, firstProvider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'duplicate-extension-provider',
        extensionIds: ['first-provider', 'second-provider'],
        kitId: 'dev.airi.example',
        message: 'Extensions "first-provider" and "second-provider" both provide Kit "dev.airi.example".',
      }],
    })
  })

  it('returns the same diagnostics for reordered Kit Provider declarations', () => {
    const createProvider = (kitIds: readonly string[]) => createManifest('extension-provider', {
      provides: kitIds.map(id => ({
        id,
        version: '1.0.0',
        exposure: 'local-only',
      })),
    })
    const plan = (provider: ExtensionManifestV2) => planExtensionActivation({
      installedManifests: [provider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [provider.id],
      hostProvidedKits: [
        { id: 'dev.airi.alpha', version: '1.0.0' },
        { id: 'dev.airi.zeta', version: '1.0.0' },
      ],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    const firstResult = plan(createProvider(['dev.airi.zeta', 'dev.airi.alpha']))
    const secondResult = plan(createProvider(['dev.airi.alpha', 'dev.airi.zeta']))

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toEqual({
      ok: false,
      diagnostics: [
        {
          code: 'host-kit-id-conflict',
          extensionIds: ['extension-provider'],
          kitId: 'dev.airi.alpha',
          providerVersion: '1.0.0',
          message: 'Extension "extension-provider" cannot provide Host Kit "dev.airi.alpha".',
        },
        {
          code: 'host-kit-id-conflict',
          extensionIds: ['extension-provider'],
          kitId: 'dev.airi.zeta',
          providerVersion: '1.0.0',
          message: 'Extension "extension-provider" cannot provide Host Kit "dev.airi.zeta".',
        },
      ],
    })
  })

  it('rejects an Extension Provider that conflicts with a Host Kit', () => {
    const provider = createManifest('extension-provider', {
      provides: [{
        id: 'dev.airi.host-example',
        version: '1.0.0',
        exposure: 'local-only',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [provider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [provider.id],
      hostProvidedKits: [{ id: 'dev.airi.host-example', version: '1.0.0' }],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'host-kit-id-conflict',
        extensionIds: ['extension-provider'],
        kitId: 'dev.airi.host-example',
        providerVersion: '1.0.0',
        message: 'Extension "extension-provider" cannot provide Host Kit "dev.airi.host-example".',
      }],
    })
  })

  it('rejects an incompatible required Kit version', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '^2.0.0' }],
    })
    const provider = createManifest('provider-extension', {
      provides: [{
        id: 'dev.airi.example',
        version: '1.5.0',
        exposure: 'local-only',
      }],
    })

    const result = planExtensionActivation({
      installedManifests: [provider, consumer],
      loadedManifests: [],
      proposedEnabledExtensionIds: [provider.id, consumer.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'incompatible-kit-version',
        extensionIds: ['consumer-extension', 'provider-extension'],
        kitId: 'dev.airi.example',
        requestedVersion: '^2.0.0',
        providerVersion: '1.5.0',
        message: 'Extension "consumer-extension" requires Kit "dev.airi.example" ^2.0.0, but "provider-extension" provides 1.5.0.',
      }],
    })
  })

  it('matches a compound Consumer range against an exact Provider version', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '>=1 <2' }],
    })
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.5.0', exposure: 'local-only' }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer, provider],
      loadedManifests: [],
      proposedEnabledExtensionIds: [consumer.id, provider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result.ok).toBe(true)
  })

  it('matches prerelease Providers only when the Consumer range includes prereleases', () => {
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '>=1.0.0-beta.1 <1.0.0' }],
    })
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.0.0-beta.2', exposure: 'local-only' }],
    })
    const plan = (requestedVersion: string) => {
      consumer.kits = {
        uses: [{ id: 'dev.airi.example', version: requestedVersion }],
      }
      return planExtensionActivation({
        installedManifests: [consumer, provider],
        loadedManifests: [],
        proposedEnabledExtensionIds: [consumer.id, provider.id],
        hostProvidedKits: [],
        runtime: 'electron',
        airiVersion: '1.0.0',
        systemEnabled: true,
      })
    }

    expect(plan('>=1.0.0-beta.1 <1.0.0').ok).toBe(true)
    expect(plan('^1.0.0')).toEqual({
      ok: false,
      diagnostics: [{
        code: 'incompatible-kit-version',
        extensionIds: ['consumer-extension', 'provider-extension'],
        kitId: 'dev.airi.example',
        requestedVersion: '^1.0.0',
        providerVersion: '1.0.0-beta.2',
        message: 'Extension "consumer-extension" requires Kit "dev.airi.example" ^1.0.0, but "provider-extension" provides 1.0.0-beta.2.',
      }],
    })
  })

  it('rejects an enabled Extension that is not installed', () => {
    const result = planExtensionActivation({
      installedManifests: [],
      loadedManifests: [],
      proposedEnabledExtensionIds: ['missing-extension'],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'enabled-extension-not-installed',
        extensionIds: ['missing-extension'],
        message: 'Enabled Extension "missing-extension" is not installed.',
      }],
    })
  })

  it('rejects an Extension that does not support the Host runtime', () => {
    const extension = createManifest('electron-extension')

    const result = planExtensionActivation({
      installedManifests: [extension],
      loadedManifests: [],
      proposedEnabledExtensionIds: [extension.id],
      hostProvidedKits: [],
      runtime: 'node',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'incompatible-runtime',
        extensionIds: ['electron-extension'],
        message: 'Extension "electron-extension" does not support runtime "node".',
      }],
    })
  })

  it('rejects an Extension that does not support the AIRI version', () => {
    const extension = createManifest('future-extension')
    extension.engines.airi = '^2.0.0'

    const result = planExtensionActivation({
      installedManifests: [extension],
      loadedManifests: [],
      proposedEnabledExtensionIds: [extension.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.5.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'incompatible-airi-version',
        extensionIds: ['future-extension'],
        requestedVersion: '^2.0.0',
        providerVersion: '1.5.0',
        message: 'Extension "future-extension" requires AIRI ^2.0.0, but the Host runs 1.5.0.',
      }],
    })
  })

  it('rejects duplicate installed Extension ids', () => {
    const firstManifest = createManifest('duplicate-extension')
    const secondManifest = createManifest('duplicate-extension')
    secondManifest.version = '2.0.0'

    const result = planExtensionActivation({
      installedManifests: [secondManifest, firstManifest],
      loadedManifests: [],
      proposedEnabledExtensionIds: [firstManifest.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'duplicate-installed-extension',
        extensionIds: ['duplicate-extension'],
        message: 'Installed Extension id "duplicate-extension" appears more than once.',
      }],
    })
  })

  it('returns the same diagnostics for reordered duplicate installed manifests', () => {
    const plainManifest = createManifest('duplicate-extension')
    const conflictingManifest = createManifest('duplicate-extension', {
      provides: [{ id: 'dev.airi.host-example', version: '1.0.0', exposure: 'local-only' }],
    })
    const plan = (installedManifests: readonly ExtensionManifestV2[]) => planExtensionActivation({
      installedManifests,
      loadedManifests: [],
      proposedEnabledExtensionIds: ['duplicate-extension'],
      hostProvidedKits: [{ id: 'dev.airi.host-example', version: '1.0.0' }],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    const firstResult = plan([plainManifest, conflictingManifest])
    const secondResult = plan([conflictingManifest, plainManifest])

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toEqual({
      ok: false,
      diagnostics: [{
        code: 'duplicate-installed-extension',
        extensionIds: ['duplicate-extension'],
        message: 'Installed Extension id "duplicate-extension" appears more than once.',
      }],
    })
  })

  it('rejects duplicate loaded Extension ids', () => {
    const installedManifest = createManifest('duplicate-session')
    const firstSessionManifest = createManifest('duplicate-session')
    const secondSessionManifest = createManifest('duplicate-session')

    const result = planExtensionActivation({
      installedManifests: [installedManifest],
      loadedManifests: [secondSessionManifest, firstSessionManifest],
      proposedEnabledExtensionIds: [installedManifest.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'duplicate-loaded-extension',
        extensionIds: ['duplicate-session'],
        message: 'Loaded Extension id "duplicate-session" appears more than once.',
      }],
    })
  })

  it('rejects a required dependency cycle', () => {
    const firstExtension = createManifest('first-extension', {
      provides: [{ id: 'dev.airi.first', version: '1.0.0', exposure: 'local-only' }],
      uses: [{ id: 'dev.airi.second', version: '^1.0.0' }],
    })
    const secondExtension = createManifest('second-extension', {
      provides: [{ id: 'dev.airi.second', version: '1.0.0', exposure: 'local-only' }],
      uses: [{ id: 'dev.airi.first', version: '^1.0.0' }],
    })

    const result = planExtensionActivation({
      installedManifests: [secondExtension, firstExtension],
      loadedManifests: [],
      proposedEnabledExtensionIds: [secondExtension.id, firstExtension.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'dependency-cycle',
        extensionIds: ['first-extension', 'second-extension'],
        message: 'Required Kit dependencies form a cycle: "first-extension", "second-extension".',
      }],
    })
  })

  it('rejects a required dependency cycle in the live session graph', () => {
    const firstExtension = createManifest('first-extension', {
      provides: [{ id: 'dev.airi.first', version: '1.0.0', exposure: 'local-only' }],
      uses: [{ id: 'dev.airi.second', version: '^1.0.0' }],
    })
    const secondExtension = createManifest('second-extension', {
      provides: [{ id: 'dev.airi.second', version: '1.0.0', exposure: 'local-only' }],
      uses: [{ id: 'dev.airi.first', version: '^1.0.0' }],
    })

    const result = planExtensionActivation({
      installedManifests: [],
      loadedManifests: [secondExtension, firstExtension],
      proposedEnabledExtensionIds: [],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: false,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'dependency-cycle',
        extensionIds: ['first-extension', 'second-extension'],
        message: 'Required Kit dependencies form a cycle: "first-extension", "second-extension".',
      }],
    })
  })

  it('stops loaded Consumers before Providers when the system is disabled', () => {
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.0.0', exposure: 'local-only' }],
    })
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '^1.0.0' }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer, provider],
      loadedManifests: [consumer, provider],
      proposedEnabledExtensionIds: [provider.id, consumer.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: false,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['consumer-extension', 'provider-extension'],
        targetLoadedExtensionIds: [],
        unloadOrder: ['consumer-extension', 'provider-extension'],
        loadOrder: [],
        restartExtensionIds: [],
        resolutions: [{
          consumerExtensionId: 'consumer-extension',
          kitId: 'dev.airi.example',
          requestedVersion: '^1.0.0',
          optional: false,
          provider: {
            kind: 'extension',
            extensionId: 'provider-extension',
            version: '1.0.0',
          },
        }],
      },
    })
  })

  it('restarts all required Consumers when a Provider restarts', () => {
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.0.0', exposure: 'local-only' }],
    })
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '^1.0.0' }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer, provider],
      loadedManifests: [consumer, provider],
      proposedEnabledExtensionIds: [consumer.id, provider.id],
      restartExtensionIds: [provider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['consumer-extension', 'provider-extension'],
        targetLoadedExtensionIds: ['consumer-extension', 'provider-extension'],
        unloadOrder: ['consumer-extension', 'provider-extension'],
        loadOrder: ['provider-extension', 'consumer-extension'],
        restartExtensionIds: ['consumer-extension', 'provider-extension'],
        resolutions: [{
          consumerExtensionId: 'consumer-extension',
          kitId: 'dev.airi.example',
          requestedVersion: '^1.0.0',
          optional: false,
          provider: {
            kind: 'extension',
            extensionId: 'provider-extension',
            version: '1.0.0',
          },
        }],
      },
    })
  })

  it('keeps a missing optional Kit as a non-blocking resolution', () => {
    const consumer = createManifest('optional-consumer', {
      uses: [{ id: 'dev.airi.optional', version: '^1.0.0', optional: true }],
    })

    const result = planExtensionActivation({
      installedManifests: [consumer],
      loadedManifests: [],
      proposedEnabledExtensionIds: [consumer.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['optional-consumer'],
        targetLoadedExtensionIds: ['optional-consumer'],
        unloadOrder: [],
        loadOrder: ['optional-consumer'],
        restartExtensionIds: [],
        resolutions: [{
          consumerExtensionId: 'optional-consumer',
          kitId: 'dev.airi.optional',
          requestedVersion: '^1.0.0',
          optional: true,
          provider: { kind: 'unresolved', reason: 'missing' },
        }],
      },
    })
  })

  it('rejects an Extension that requires its own Kit', () => {
    const extension = createManifest('self-dependent-extension', {
      provides: [{ id: 'dev.airi.self', version: '1.0.0', exposure: 'local-only' }],
      uses: [{ id: 'dev.airi.self', version: '^1.0.0' }],
    })

    const result = planExtensionActivation({
      installedManifests: [extension],
      loadedManifests: [],
      proposedEnabledExtensionIds: [extension.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'dependency-cycle',
        extensionIds: ['self-dependent-extension'],
        message: 'Required Kit dependencies form a cycle: "self-dependent-extension".',
      }],
    })
  })

  it('rejects a restart request for an Extension that is not loaded', () => {
    const extension = createManifest('stopped-extension')

    const result = planExtensionActivation({
      installedManifests: [extension],
      loadedManifests: [],
      proposedEnabledExtensionIds: [extension.id],
      restartExtensionIds: [extension.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'restart-extension-not-loaded',
        extensionIds: ['stopped-extension'],
        message: 'Extension "stopped-extension" cannot restart because it is not loaded.',
      }],
    })
  })

  it('returns the same plan for equivalent input permutations', () => {
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.0.0', exposure: 'local-only' }],
    })
    const consumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '^1.0.0' }],
    })
    const commonInput = {
      loadedManifests: [],
      hostProvidedKits: [],
      runtime: 'electron' as const,
      airiVersion: '1.0.0',
      systemEnabled: true,
    }

    const firstResult = planExtensionActivation({
      ...commonInput,
      installedManifests: [provider, consumer],
      proposedEnabledExtensionIds: [consumer.id, provider.id],
    })
    const secondResult = planExtensionActivation({
      ...commonInput,
      installedManifests: [consumer, provider],
      proposedEnabledExtensionIds: [provider.id, consumer.id],
    })

    expect(secondResult).toEqual(firstResult)
  })

  it('uses the live session graph to stop old Consumers during Provider reload', () => {
    const provider = createManifest('provider-extension', {
      provides: [{ id: 'dev.airi.example', version: '1.0.0', exposure: 'local-only' }],
    })
    const loadedConsumer = createManifest('consumer-extension', {
      uses: [{ id: 'dev.airi.example', version: '^1.0.0' }],
    })
    const installedConsumer = createManifest('consumer-extension')

    const result = planExtensionActivation({
      installedManifests: [installedConsumer, provider],
      loadedManifests: [loadedConsumer, provider],
      proposedEnabledExtensionIds: [installedConsumer.id, provider.id],
      restartExtensionIds: [provider.id],
      hostProvidedKits: [],
      runtime: 'electron',
      airiVersion: '1.0.0',
      systemEnabled: true,
    })

    expect(result).toEqual({
      ok: true,
      plan: {
        enabledExtensionIds: ['consumer-extension', 'provider-extension'],
        targetLoadedExtensionIds: ['consumer-extension', 'provider-extension'],
        unloadOrder: ['consumer-extension', 'provider-extension'],
        loadOrder: ['consumer-extension', 'provider-extension'],
        restartExtensionIds: ['consumer-extension', 'provider-extension'],
        resolutions: [],
      },
    })
  })
})
