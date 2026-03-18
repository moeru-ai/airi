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

function normalizeDeclaration(declaration?: ModulePermissionDeclaration | null): ModulePermissionDeclaration {
  return {
    apis: declaration?.apis ?? [],
    resources: declaration?.resources ?? [],
    capabilities: declaration?.capabilities ?? [],
    processors: declaration?.processors ?? [],
    pipelines: declaration?.pipelines ?? [],
  }
}

function intersectPermissionScopes<T extends PermissionScope>(
  requested: T[] | undefined,
  granted: T[] | undefined,
): T[] {
  if (!requested?.length || !granted?.length) {
    return []
  }

  const result: T[] = []
  for (const requestedSpec of requested) {
    const matched = granted.filter(candidate => matchKey(candidate.key, requestedSpec.key) || matchKey(requestedSpec.key, candidate.key))
    if (matched.length === 0) {
      continue
    }

    const actions = new Set<T['actions'][number]>()
    for (const candidate of matched) {
      for (const action of candidate.actions) {
        if (hasAction(requestedSpec.actions, action)) {
          actions.add(action)
        }
      }
    }

    if (actions.size === 0) {
      continue
    }

    result.push({
      ...requestedSpec,
      actions: [...actions],
    } as T)
  }

  return result
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

function mergePermissionScopes<T extends PermissionScope>(
  current: T[] | undefined,
  incoming: T[] | undefined,
): T[] {
  const map = new Map<string, T>()

  for (const list of [current ?? [], incoming ?? []]) {
    for (const spec of list) {
      const previous = map.get(spec.key)
      const actions = new Set(previous?.actions ?? [])
      for (const action of spec.actions) {
        actions.add(action)
      }
      map.set(spec.key, {
        ...previous,
        ...spec,
        actions: [...actions],
      } as T)
    }
  }

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
