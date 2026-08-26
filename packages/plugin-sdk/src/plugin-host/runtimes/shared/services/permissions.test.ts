import type { ModulePermissionDeclaration } from '@proj-airi/plugin-protocol/types'

import { describe, expect, it } from 'vitest'

import { PermissionService } from './permissions'

describe('permissionService', () => {
  it('normalizes declarations and intersects grants per area', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      apis: [
        { actions: ['invoke', 'emit'], key: 'plugin.api.users', reason: 'requested-reason' },
      ],
    }

    const snapshot = service.initialize('plugin-a', requested, {
      grant: {
        apis: [
          { actions: ['invoke'], key: 'plugin.api.*' },
          { actions: ['emit'], key: 'plugin.api.audit' },
        ],
      },
    })

    expect(snapshot.requested.resources).toEqual([])
    expect(snapshot.granted.apis).toEqual([
      {
        actions: ['invoke'],
        key: 'plugin.api.users',
        reason: 'requested-reason',
      },
    ])
  })

  it('merges persisted and incremental grants while preserving requested descriptors', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      resources: [
        {
          actions: ['read', 'write'],
          key: 'plugin.resource.settings',
          label: 'Settings',
          metadata: { source: 'manifest' },
        },
      ],
    }

    const initialized = service.initialize('plugin-b', requested, {
      grant: {},
      persisted: {
        resources: [
          { actions: ['read'], key: 'plugin.resource.settings' },
        ],
      },
    })

    expect(initialized.granted.resources).toEqual([
      {
        actions: ['read'],
        key: 'plugin.resource.settings',
        label: 'Settings',
        metadata: { source: 'manifest' },
      },
    ])

    const updated = service.grant('plugin-b', {
      resources: [
        { actions: ['write'], key: 'plugin.resource.settings' },
      ],
    })

    expect(updated.granted.resources).toEqual([
      {
        actions: ['read', 'write'],
        key: 'plugin.resource.settings',
        label: 'Settings',
        metadata: { source: 'manifest' },
      },
    ])
    expect(service.isAllowed('plugin-b', 'resources', 'write', 'plugin.resource.settings')).toBe(true)
  })

  it('extends the requested baseline before granting runtime-declared permissions', () => {
    const service = new PermissionService()
    const initialized = service.initialize('plugin-runtime', {}, {
      grant: {},
    })

    expect(initialized.requested.apis).toEqual([])

    const declared = service.declare('plugin-runtime', {
      apis: [
        {
          actions: ['invoke'],
          key: 'plugin.api.runtime',
          reason: 'Late-bound runtime capability',
        },
      ],
    })

    expect(declared.requested.apis).toEqual([
      {
        actions: ['invoke'],
        key: 'plugin.api.runtime',
        reason: 'Late-bound runtime capability',
      },
    ])
    expect(declared.granted.apis).toEqual([])

    const granted = service.grant('plugin-runtime', {
      apis: [
        {
          actions: ['invoke'],
          key: 'plugin.api.runtime',
        },
      ],
    })

    expect(granted.granted.apis).toEqual([
      {
        actions: ['invoke'],
        key: 'plugin.api.runtime',
        reason: 'Late-bound runtime capability',
      },
    ])
    expect(service.isAllowed('plugin-runtime', 'apis', 'invoke', 'plugin.api.runtime')).toBe(true)
  })

  it('stores the narrower granted key when a wildcard request is only partially approved', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      resources: [
        {
          actions: ['read'],
          key: 'plugin.resource.*',
          reason: 'Read plugin resources',
        },
      ],
    }

    // This occurs when a plugin asks for a wildcard scope up front, but the host policy
    // or user approval flow only accepts one concrete resource key from that set.
    // The bug was caused by the intersection logic always writing back the requested key,
    // which meant `plugin.resource.*` stayed in the granted snapshot even though the host
    // only approved `plugin.resource.settings`.
    const snapshot = service.initialize('plugin-c', requested, {
      grant: {
        resources: [
          { actions: ['read'], key: 'plugin.resource.settings' },
        ],
      },
    })

    // We expect the effective grant to contain only the host-approved concrete key.
    // That way later `isAllowed(...)` checks reflect the actual approval boundary instead
    // of silently widening it back to the plugin's original wildcard request.
    expect(snapshot.granted.resources).toEqual([
      {
        actions: ['read'],
        key: 'plugin.resource.settings',
        reason: 'Read plugin resources',
      },
    ])
    expect(service.isAllowed('plugin-c', 'resources', 'read', 'plugin.resource.settings')).toBe(true)
    expect(service.isAllowed('plugin-c', 'resources', 'read', 'plugin.resource.secrets')).toBe(false)
  })

  it('splits a broad request into per-grant scopes when the host approves disjoint keys', () => {
    const service = new PermissionService()
    const requested: ModulePermissionDeclaration = {
      apis: [
        { actions: ['invoke', 'emit'], key: 'plugin.api.*', reason: 'Use selected APIs' },
      ],
    }

    // This occurs when a plugin requests one broad API namespace, but the host grants a
    // selective subset across different keys and actions. That is a normal outcome for a
    // least-privilege resolver that narrows access based on policy, user consent, or both.
    // The old behavior collapsed every overlap back into the wildcard request, which let one
    // narrow approval accidentally authorize unrelated keys within the same namespace.
    const snapshot = service.initialize('plugin-d', requested, {
      grant: {
        apis: [
          { actions: ['invoke'], key: 'plugin.api.users' },
          { actions: ['emit'], key: 'plugin.api.audit' },
        ],
      },
    })

    // We expect one granted scope per concrete approval because each grant represents a
    // separate host decision. Preserving those concrete keys keeps later permission checks
    // aligned with the host's intent: users invoke `plugin.api.users`, emit to
    // `plugin.api.audit`, and nothing else is implied.
    expect(snapshot.granted.apis).toEqual([
      {
        actions: ['invoke'],
        key: 'plugin.api.users',
        reason: 'Use selected APIs',
      },
      {
        actions: ['emit'],
        key: 'plugin.api.audit',
        reason: 'Use selected APIs',
      },
    ])
    expect(service.isAllowed('plugin-d', 'apis', 'invoke', 'plugin.api.users')).toBe(true)
    expect(service.isAllowed('plugin-d', 'apis', 'emit', 'plugin.api.audit')).toBe(true)
    expect(service.isAllowed('plugin-d', 'apis', 'emit', 'plugin.api.users')).toBe(false)
    expect(service.isAllowed('plugin-d', 'apis', 'invoke', 'plugin.api.billing')).toBe(false)
  })

  it('caps module grants by the extension permission ceiling', () => {
    const service = new PermissionService()
    const extension = service.initialize('extension-session', {
      apis: [{ actions: ['invoke'], key: 'kit.tools.register' }],
    })
    const module = service.initialize('module-session', {
      apis: [
        { actions: ['invoke'], key: 'kit.tools.register' },
        { actions: ['invoke'], key: 'kit.gamelet.open' },
      ],
    })

    const effective = service.intersectGrant(extension.granted, module.requested)

    expect(effective.apis).toEqual([
      { actions: ['invoke'], key: 'kit.tools.register' },
    ])
  })
})
