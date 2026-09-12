import type { ExtensionManifestV2 } from '@proj-airi/plugin-sdk/plugin-host'

import type { ManifestEntry } from '../types'

import { describe, expect, it } from 'vitest'

import { createExtensionActivationPlan } from './activation-plan'

function manifest(options: {
  id: string
  provides?: Array<{ id: string, version: string }>
  uses?: Array<{ id: string, version: string, optional?: boolean }>
}): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id: options.id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    entrypoints: { electron: `./${options.id}.mjs` },
    permissions: {},
    kits: {
      provides: options.provides?.map(declaration => ({ ...declaration, exposure: 'local-only' })),
      uses: options.uses,
    },
  }
}

function entry(manifest: ExtensionManifestV2): ManifestEntry {
  return {
    manifest,
    path: `${manifest.id}/extension.airi.json`,
    rootDir: manifest.id,
    version: manifest.version,
  }
}

describe('createExtensionActivationPlan', () => {
  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986343866
  it('loads required Kit Providers before their Consumers', () => {
    const consumer = manifest({
      id: 'consumer',
      uses: [{ id: 'kit.agent-activity', version: '1.0.0' }],
    })
    const provider = manifest({
      id: 'provider',
      provides: [{ id: 'kit.agent-activity', version: '1.0.0' }],
    })

    expect(createExtensionActivationPlan([entry(consumer), entry(provider)]).map(item => item.manifest.id)).toEqual([
      'provider',
      'consumer',
    ])
  })

  it('orders transitive required Kit dependencies and ignores optional Kits', () => {
    const consumer = manifest({
      id: 'consumer',
      uses: [{ id: 'kit.reaction', version: '1.0.0' }],
    })
    const adapter = manifest({
      id: 'adapter',
      provides: [{ id: 'kit.reaction', version: '1.0.0' }],
      uses: [
        { id: 'kit.activity', version: '1.0.0' },
        { id: 'kit.optional', version: '1.0.0', optional: true },
      ],
    })
    const provider = manifest({
      id: 'provider',
      provides: [{ id: 'kit.activity', version: '1.0.0' }],
    })

    expect(createExtensionActivationPlan([entry(consumer), entry(adapter), entry(provider)]).map(item => item.manifest.id)).toEqual([
      'provider',
      'adapter',
      'consumer',
    ])
  })
})
