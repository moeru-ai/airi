import type {
  ModulePermissionArea,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
} from '@proj-airi/plugin-protocol/types'

interface PermissionSnapshot {
  requested: ModulePermissionDeclaration
  granted: ModulePermissionGrant
  revision: number
}

interface PermissionScope<Action extends string = string> {
  key: string
  actions: Action[]
}

function hasAction<Action extends string>(actions: Action[], action: string): action is Action {
  return actions.includes(action as Action)
}

function matchKey(pattern: string, target: string) {
  if (pattern === '*') {
    return true
  }

  if (pattern.endsWith('*')) {
    return target.startsWith(pattern.slice(0, -1))
  }

  return pattern === target
}

function getIntersectionKey(left: string, right: string) {
  if (matchKey(left, right)) {
    return right
  }

  if (matchKey(right, left)) {
    return left
  }

  return undefined
}

function normalizeDeclaration(declaration?: ModulePermissionDeclaration | null): ModulePermissionDeclaration {
  return {
    apis: declaration?.apis ?? [],
    resources: declaration?.resources ?? [],
    capabilities: declaration?.capabilities ?? [],
    processors: declaration?.processors ?? [],
    pipelines: declaration?.pipelines ?? [],
  }
}

/**
 * Computes the effective permission scopes for one area by intersecting what the plugin asked for
 * with what the host actually approved.
 *
 * Use cases:
 * - Requested `plugin.api.users` + granted `plugin.api.*` => effective key `plugin.api.users`
 * - Requested `plugin.api.*` + granted `plugin.api.users` => effective key `plugin.api.users`
 * - Requested actions `['invoke', 'emit']` + granted actions `['invoke']` => effective actions `['invoke']`
 *
 * The returned scopes always stay within both boundaries:
 * - never broader than the plugin request
 * - never broader than the host grant
 *
 * We also preserve request-side metadata such as `reason` and `label`, because those describe why
 * the plugin asked for the permission and should remain visible in the effective snapshot.
 */
function intersectPermissionScopes<T extends PermissionScope>(
  requested: T[] | undefined,
  granted: T[] | undefined,
): T[] {
  if (!requested?.length || !granted?.length) {
    return []
  }

  const result = new Map<string, T>()
  for (const requestedSpec of requested) {
    // Example:
    // - requestedSpec.key = 'plugin.api.*'
    // - requestedSpec.actions = ['invoke', 'emit']
    //
    // We compare this one requested scope against every host-approved candidate to find the
    // concrete overlaps that should become effective grants.
    for (const candidate of granted) {
      // Example candidate:
      // - candidate.key = 'plugin.api.users'
      // - candidate.actions = ['invoke']
      //
      // `getIntersectionKey(...)` returns the narrower key shared by both scopes:
      // - requested 'plugin.api.*' + granted 'plugin.api.users' => 'plugin.api.users'
      // - requested 'plugin.api.users' + granted 'plugin.api.*' => 'plugin.api.users'
      // - requested 'plugin.api.users' + granted 'plugin.api.audit' => undefined
      const intersectionKey = getIntersectionKey(requestedSpec.key, candidate.key)
      if (!intersectionKey) {
        // No shared boundary means this host grant does not authorize anything from this request.
        // Example:
        // - requestedSpec.key = 'plugin.api.users'
        // - candidate.key = 'plugin.api.audit'
        // Result: skip this pair completely.
        continue
      }

      const actions = new Set<T['actions'][number]>()
      for (const action of candidate.actions) {
        // We only keep actions present in both lists.
        // Example:
        // - requestedSpec.actions = ['invoke', 'emit']
        // - candidate.actions = ['invoke']
        // Result: actions = ['invoke']
        //
        // If candidate.actions contains an action the plugin never requested, such as 'manage',
        // we must not widen access, so that action is dropped here.
        if (hasAction(requestedSpec.actions, action)) {
          actions.add(action)
        }
      }

      if (actions.size === 0) {
        // Keys overlap, but the actions do not.
        // Example:
        // - requestedSpec.key = 'plugin.api.users', requestedSpec.actions = ['emit']
        // - candidate.key = 'plugin.api.users', candidate.actions = ['invoke']
        // Result: still not allowed, because there is no shared action.
        continue
      }

      const existing = result.get(intersectionKey)
      const mergedActions = new Set(existing?.actions ?? [])
      for (const action of actions) {
        // Multiple host grants can contribute actions to the same effective key.
        // Example:
        // - candidate #1 grants 'plugin.api.users' -> ['invoke']
        // - candidate #2 grants 'plugin.api.users' -> ['emit']
        // Result after merging: 'plugin.api.users' -> ['invoke', 'emit']
        mergedActions.add(action)
      }

      result.set(intersectionKey, {
        // Preserve the request-side descriptor while narrowing the key/actions to the true overlap.
        // Example output:
        // {
        //   key: 'plugin.api.users',
        //   actions: ['invoke'],
        //   reason: requestedSpec.reason,
        // }
        ...requestedSpec,
        ...existing,
        key: intersectionKey,
        actions: [...mergedActions],
      } as T)
    }
  }

  return [...result.values()]
}

function intersectPermissions(
  requested: ModulePermissionDeclaration,
  grant: ModulePermissionGrant,
): ModulePermissionGrant {
  return {
    apis: intersectPermissionScopes(requested.apis, grant.apis),
    resources: intersectPermissionScopes(requested.resources, grant.resources),
    capabilities: intersectPermissionScopes(requested.capabilities, grant.capabilities),
    processors: intersectPermissionScopes(requested.processors, grant.processors),
    pipelines: intersectPermissionScopes(requested.pipelines, grant.pipelines),
  }
}

/**
 * Merges two scope lists for the same permission area by key, unioning actions for duplicate keys.
 *
 * Use cases:
 * - persisted `plugin.resource.settings -> ['read']` + incoming `plugin.resource.settings -> ['write']`
 *   => `plugin.resource.settings -> ['read', 'write']`
 * - current `plugin.api.users -> ['invoke']` + incoming `plugin.api.audit -> ['emit']`
 *   => both scopes remain in the result because their keys differ
 *
 * This is used when permission state needs accumulation rather than narrowing, such as:
 * - combining persisted grants with new grants
 * - extending requested declarations with newly runtime-declared scopes
 */
function mergePermissionScopes<T extends PermissionScope>(
  current: T[] | undefined,
  incoming: T[] | undefined,
): T[] {
  const map = new Map<string, T>()

  for (const list of [current ?? [], incoming ?? []]) {
    // We process the existing list first, then layer the incoming list on top.
    // Example:
    // - current  = [{ key: 'plugin.resource.settings', actions: ['read'] }]
    // - incoming = [{ key: 'plugin.resource.settings', actions: ['write'] }]
    //
    // The first pass seeds the map with ['read']; the second pass extends it to
    // ['read', 'write'] for the same key.
    for (const spec of list) {
      // `spec` is one concrete scope such as:
      // - { key: 'plugin.api.users', actions: ['invoke'] }
      // or
      // - { key: 'plugin.resource.settings', actions: ['write'] }
      const previous = map.get(spec.key)
      const actions = new Set(previous?.actions ?? [])
      for (const action of spec.actions) {
        // Actions are unioned, not replaced.
        // Example:
        // - previous.actions = ['read']
        // - spec.actions = ['write']
        // Result: ['read', 'write']
        //
        // If the same action appears twice, Set keeps it unique.
        actions.add(action)
      }
      map.set(spec.key, {
        // For duplicate keys, later fields from `spec` can refine metadata while actions remain
        // cumulative. For distinct keys, this simply inserts a new scope entry.
        ...previous,
        ...spec,
        actions: [...actions],
      } as T)
    }
  }

  // The map now holds one merged scope per key.
  return [...map.values()]
}

function mergePermissions(current: ModulePermissionGrant, incoming: ModulePermissionGrant): ModulePermissionGrant {
  return {
    apis: mergePermissionScopes(current.apis, incoming.apis),
    resources: mergePermissionScopes(current.resources, incoming.resources),
    capabilities: mergePermissionScopes(current.capabilities, incoming.capabilities),
    processors: mergePermissionScopes(current.processors, incoming.processors),
    pipelines: mergePermissionScopes(current.pipelines, incoming.pipelines),
  }
}

function mergePermissionDeclarations(
  current: ModulePermissionDeclaration,
  incoming: ModulePermissionDeclaration,
): ModulePermissionDeclaration {
  return {
    apis: mergePermissionScopes(current.apis, incoming.apis),
    resources: mergePermissionScopes(current.resources, incoming.resources),
    capabilities: mergePermissionScopes(current.capabilities, incoming.capabilities),
    processors: mergePermissionScopes(current.processors, incoming.processors),
    pipelines: mergePermissionScopes(current.pipelines, incoming.pipelines),
  }
}

export class PermissionService {
  private readonly store = new Map<string, PermissionSnapshot>()

  initialize(
    pluginId: string,
    requestedDeclaration: ModulePermissionDeclaration,
    options?: {
      grant?: ModulePermissionGrant
      persisted?: ModulePermissionGrant
    },
  ) {
    const requested = normalizeDeclaration(requestedDeclaration)
    const persisted = options?.persisted ?? {}
    const explicitGrant = options?.grant ?? requested
    const mergedGrant = mergePermissions(persisted, explicitGrant)
    const granted = intersectPermissions(requested, mergedGrant)
    const previousRevision = this.store.get(pluginId)?.revision ?? 0
    const snapshot: PermissionSnapshot = {
      requested,
      granted,
      revision: previousRevision + 1,
    }

    this.store.set(pluginId, snapshot)
    return snapshot
  }

  declare(pluginId: string, requestedDeclaration: ModulePermissionDeclaration) {
    const existing = this.store.get(pluginId)
    if (!existing) {
      throw new Error(`Cannot declare permissions for unknown plugin "${pluginId}".`)
    }

    const requested = normalizeDeclaration(requestedDeclaration)
    const snapshot: PermissionSnapshot = {
      requested: mergePermissionDeclarations(existing.requested, requested),
      granted: existing.granted,
      revision: existing.revision + 1,
    }

    this.store.set(pluginId, snapshot)
    return snapshot
  }

  grant(pluginId: string, grant: ModulePermissionGrant) {
    const existing = this.store.get(pluginId)
    if (!existing) {
      throw new Error(`Cannot grant permissions to unknown plugin "${pluginId}".`)
    }

    const mergedGranted = mergePermissions(existing.granted, grant)
    const snapshot: PermissionSnapshot = {
      requested: existing.requested,
      granted: intersectPermissions(existing.requested, mergedGranted),
      revision: existing.revision + 1,
    }
    this.store.set(pluginId, snapshot)
    return snapshot
  }

  get(pluginId: string) {
    return this.store.get(pluginId)
  }

  isAllowed(pluginId: string, area: ModulePermissionArea, action: string, key: string) {
    const snapshot = this.store.get(pluginId)
    if (!snapshot) {
      return false
    }

    const scopes = snapshot.granted[area] ?? []
    return scopes.some(scope =>
      matchKey(scope.key, key)
      && hasAction(scope.actions, action),
    )
  }
}
