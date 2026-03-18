import type { ModulePermissionDeclaration } from '@proj-airi/plugin-protocol/types'

import { describe, expect, it } from 'vitest'

import { PermissionService } from './permissions'

describe('permissionService', () => {
  it('normalizes declarations and intersects grants per area', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      apis: [
        { key: 'plugin.api.users', actions: ['invoke', 'emit'], reason: 'requested-reason' },
      ],
    }

    const snapshot = service.initialize('plugin-a', requested, {
      grant: {
        apis: [
          { key: 'plugin.api.*', actions: ['invoke'] },
          { key: 'plugin.api.audit', actions: ['emit'] },
        ],
      },
    })

    expect(snapshot.requested.resources).toEqual([])
    expect(snapshot.granted.apis).toEqual([
      {
        key: 'plugin.api.users',
        actions: ['invoke'],
        reason: 'requested-reason',
      },
    ])
  })

  it('merges persisted and incremental grants while preserving requested descriptors', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      resources: [
        {
          key: 'plugin.resource.settings',
          actions: ['read', 'write'],
          label: 'Settings',
          metadata: { source: 'manifest' },
        },
      ],
    }

    const initialized = service.initialize('plugin-b', requested, {
      persisted: {
        resources: [
          { key: 'plugin.resource.settings', actions: ['read'] },
        ],
      },
      grant: {},
    })

    expect(initialized.granted.resources).toEqual([
      {
        key: 'plugin.resource.settings',
        actions: ['read'],
        label: 'Settings',
        metadata: { source: 'manifest' },
      },
    ])

    const updated = service.grant('plugin-b', {
      resources: [
        { key: 'plugin.resource.settings', actions: ['write'] },
      ],
    })

    expect(updated.granted.resources).toEqual([
      {
        key: 'plugin.resource.settings',
        actions: ['read', 'write'],
        label: 'Settings',
        metadata: { source: 'manifest' },
      },
    ])
    expect(service.isAllowed('plugin-b', 'resources', 'write', 'plugin.resource.settings')).toBe(true)
  })
})
