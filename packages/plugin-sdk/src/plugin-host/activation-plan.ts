import type { ExtensionManifestV2, PluginRuntime } from './shared/types'

import semver from 'semver'

/** Describes one Kit contract that the Host reserves and provides. */
export interface HostProvidedKitDeclaration {
  /** Stable Kit contract identifier. */
  id: string
  /** Exact version that the Host provides. */
  version: string
}

/** Identifies the Provider selected for one Kit dependency. */
export type KitDependencyProvider
  = | { kind: 'host', version: string }
    | { kind: 'extension', extensionId: string, version: string }
    | { kind: 'unresolved', reason: 'missing' | 'incompatible-version' }

/** Records how the Planner resolved one Extension Kit dependency. */
export interface KitDependencyResolution {
  /** Extension that declares the dependency. */
  consumerExtensionId: string
  /** Stable Kit contract identifier. */
  kitId: string
  /** Version range requested by the Consumer. */
  requestedVersion: string
  /** Whether a missing or incompatible Provider can be ignored. */
  optional: boolean
  /** Provider selected from the complete target configuration. */
  provider: KitDependencyProvider
}

/** Stable code for one rejected activation configuration. */
export type ActivationDiagnosticCode
  = | 'duplicate-installed-extension'
    | 'duplicate-loaded-extension'
    | 'enabled-extension-not-installed'
    | 'incompatible-airi-version'
    | 'incompatible-runtime'
    | 'duplicate-extension-provider'
    | 'host-kit-id-conflict'
    | 'missing-required-kit'
    | 'incompatible-kit-version'
    | 'dependency-cycle'
    | 'restart-extension-not-loaded'

/** Describes one reason that prevents an activation plan. */
export interface ActivationDiagnostic {
  /** Stable code for caller control flow. */
  code: ActivationDiagnosticCode
  /** Extension identifiers related to the error. */
  extensionIds: string[]
  /** Related Kit identifier, when the error concerns a Kit. */
  kitId?: string
  /** Version range requested by a Consumer. */
  requestedVersion?: string
  /** Exact version exposed by the selected Provider. */
  providerVersion?: string
  /** Human-readable error description. */
  message: string
}

/** Contains the complete current snapshot and proposed Extension intent. */
export interface ActivationPlannerInput {
  /** Manifests available for the target configuration. */
  installedManifests: readonly ExtensionManifestV2[]
  /** Manifests used by current live sessions. */
  loadedManifests: readonly ExtensionManifestV2[]
  /** Complete enabled intent after the proposed configuration change. */
  proposedEnabledExtensionIds: readonly string[]
  /** Loaded Extensions that must restart during this transition. @default [] */
  restartExtensionIds?: readonly string[]
  /** Kit contracts reserved and provided by the Host. */
  hostProvidedKits: readonly HostProvidedKitDeclaration[]
  /** Runtime that will load the target Extensions. */
  runtime: PluginRuntime
  /** Running AIRI version. When omitted, the Planner skips AIRI compatibility validation. @default undefined */
  airiVersion?: string
  /** Whether the Host can run enabled Extensions. */
  systemEnabled: boolean
}

/** Describes one deterministic transition from current sessions to target sessions. */
export interface ExtensionActivationPlan {
  /** Stable copy of the complete enabled intent. */
  enabledExtensionIds: string[]
  /** Extensions that must run after the transition. */
  targetLoadedExtensionIds: string[]
  /** Current sessions to stop in Consumer-first order. */
  unloadOrder: string[]
  /** Target sessions to start in Provider-first order. */
  loadOrder: string[]
  /** Loaded Extensions included in the restart transition. */
  restartExtensionIds: string[]
  /** Resolution record for each target Kit dependency. */
  resolutions: KitDependencyResolution[]
}

/** Represents a valid activation plan or all blocking diagnostics. */
export type ActivationPlanningResult
  = | { ok: true, plan: ExtensionActivationPlan }
    | { ok: false, diagnostics: ActivationDiagnostic[] }

type ResolvedKitProvider
  = | { kind: 'host', version: string }
    | { kind: 'extension', extensionId: string, version: string }

const emptyExtensionIds: readonly string[] = Object.freeze([])
const emptyExtensionIdSet: ReadonlySet<string> = Object.freeze(new Set<string>())

/**
 * Plans one Extension activation transition without runtime side effects.
 *
 * The Planner reads the complete current snapshot and target intent. It returns
 * one deterministic plan or structured diagnostics. It does not mutate config
 * or Extension lifecycle state.
 */
export function planExtensionActivation(input: ActivationPlannerInput): ActivationPlanningResult {
  const enabledExtensionIds = [...new Set(input.proposedEnabledExtensionIds)].sort()
  const targetLoadedExtensionIds = input.systemEnabled ? enabledExtensionIds : []
  const loadedExtensionIds = [...new Set(input.loadedManifests.map(manifest => manifest.id))].sort()
  const loadedExtensionIdSet = new Set(loadedExtensionIds)
  const requestedRestartExtensionIds = [...new Set(input.restartExtensionIds ?? emptyExtensionIds)].sort()
  const diagnostics: ActivationDiagnostic[] = []
  const installedCounts = new Map<string, number>()
  for (const manifest of input.installedManifests) {
    installedCounts.set(manifest.id, (installedCounts.get(manifest.id) ?? 0) + 1)
  }
  const duplicateInstalledExtensionIds = new Set<string>()
  for (const [extensionId, count] of [...installedCounts].sort(([left], [right]) => left.localeCompare(right))) {
    if (count > 1) {
      duplicateInstalledExtensionIds.add(extensionId)
      diagnostics.push({
        code: 'duplicate-installed-extension',
        extensionIds: [extensionId],
        message: `Installed Extension id "${extensionId}" appears more than once.`,
      })
    }
  }
  const loadedCounts = new Map<string, number>()
  for (const manifest of input.loadedManifests) {
    loadedCounts.set(manifest.id, (loadedCounts.get(manifest.id) ?? 0) + 1)
  }
  for (const [extensionId, count] of [...loadedCounts].sort(([left], [right]) => left.localeCompare(right))) {
    if (count > 1) {
      diagnostics.push({
        code: 'duplicate-loaded-extension',
        extensionIds: [extensionId],
        message: `Loaded Extension id "${extensionId}" appears more than once.`,
      })
    }
  }
  for (const extensionId of requestedRestartExtensionIds) {
    if (!loadedExtensionIdSet.has(extensionId)) {
      diagnostics.push({
        code: 'restart-extension-not-loaded',
        extensionIds: [extensionId],
        message: `Extension "${extensionId}" cannot restart because it is not loaded.`,
      })
    }
  }
  const installedById = new Map<string, ExtensionManifestV2>()
  for (const manifest of input.installedManifests) {
    if (!duplicateInstalledExtensionIds.has(manifest.id)) {
      installedById.set(manifest.id, manifest)
    }
  }
  const providersByKitId = new Map<string, ResolvedKitProvider>(
    input.hostProvidedKits.map(declaration => [
      declaration.id,
      { kind: 'host' as const, version: declaration.version },
    ]),
  )
  for (const extensionId of enabledExtensionIds) {
    if (duplicateInstalledExtensionIds.has(extensionId)) {
      continue
    }
    const manifest = installedById.get(extensionId)
    if (!manifest) {
      diagnostics.push({
        code: 'enabled-extension-not-installed',
        extensionIds: [extensionId],
        message: `Enabled Extension "${extensionId}" is not installed.`,
      })
      continue
    }
    if (!manifest.engines.runtimes.includes(input.runtime)) {
      diagnostics.push({
        code: 'incompatible-runtime',
        extensionIds: [extensionId],
        message: `Extension "${extensionId}" does not support runtime "${input.runtime}".`,
      })
    }
    if (input.airiVersion && !semver.satisfies(input.airiVersion, manifest.engines.airi, { includePrerelease: true })) {
      diagnostics.push({
        code: 'incompatible-airi-version',
        extensionIds: [extensionId],
        requestedVersion: manifest.engines.airi,
        providerVersion: input.airiVersion,
        message: `Extension "${extensionId}" requires AIRI ${manifest.engines.airi}, but the Host runs ${input.airiVersion}.`,
      })
    }
  }

  for (const extensionId of enabledExtensionIds) {
    if (duplicateInstalledExtensionIds.has(extensionId)) {
      continue
    }
    const manifest = installedById.get(extensionId)
    const providedKits = manifest?.kits?.provides
    if (!providedKits) {
      continue
    }
    const sortedProvidedKits = [...providedKits].sort((left, right) => {
      return left.id.localeCompare(right.id)
        || left.version.localeCompare(right.version)
        || left.exposure.localeCompare(right.exposure)
    })
    for (const declaration of sortedProvidedKits) {
      const existingProvider = providersByKitId.get(declaration.id)
      if (existingProvider?.kind === 'host') {
        diagnostics.push({
          code: 'host-kit-id-conflict',
          extensionIds: [extensionId],
          kitId: declaration.id,
          providerVersion: existingProvider.version,
          message: `Extension "${extensionId}" cannot provide Host Kit "${declaration.id}".`,
        })
        continue
      }
      if (existingProvider?.kind === 'extension') {
        diagnostics.push({
          code: 'duplicate-extension-provider',
          extensionIds: [existingProvider.extensionId, extensionId].sort(),
          kitId: declaration.id,
          message: `Extensions "${existingProvider.extensionId}" and "${extensionId}" both provide Kit "${declaration.id}".`,
        })
        continue
      }
      providersByKitId.set(declaration.id, {
        kind: 'extension',
        extensionId,
        version: declaration.version,
      })
    }
  }

  const dependenciesByExtensionId = new Map<string, Set<string>>()
  const resolutions: KitDependencyResolution[] = []
  for (const extensionId of enabledExtensionIds) {
    if (duplicateInstalledExtensionIds.has(extensionId)) {
      continue
    }
    const manifest = installedById.get(extensionId)
    const dependencies = new Set<string>()
    dependenciesByExtensionId.set(extensionId, dependencies)

    const declaredUses = manifest?.kits?.uses
    if (!declaredUses) {
      continue
    }
    const uses = [...declaredUses].sort((left, right) => left.id.localeCompare(right.id))
    for (const declaration of uses) {
      const provider = providersByKitId.get(declaration.id)
      if (!provider) {
        resolutions.push({
          consumerExtensionId: extensionId,
          kitId: declaration.id,
          requestedVersion: declaration.version,
          optional: declaration.optional ?? false,
          provider: { kind: 'unresolved', reason: 'missing' },
        })
        if (!declaration.optional) {
          diagnostics.push({
            code: 'missing-required-kit',
            extensionIds: [extensionId],
            kitId: declaration.id,
            requestedVersion: declaration.version,
            message: `Extension "${extensionId}" requires missing Kit "${declaration.id}" (${declaration.version}).`,
          })
        }
        continue
      }

      const compatible = semver.satisfies(provider.version, declaration.version)
      resolutions.push({
        consumerExtensionId: extensionId,
        kitId: declaration.id,
        requestedVersion: declaration.version,
        optional: declaration.optional ?? false,
        provider: compatible ? provider : { kind: 'unresolved', reason: 'incompatible-version' },
      })
      if (!compatible && !declaration.optional) {
        const providerName = provider.kind === 'extension'
          ? `"${provider.extensionId}"`
          : 'the Host'
        diagnostics.push({
          code: 'incompatible-kit-version',
          extensionIds: provider.kind === 'extension'
            ? [extensionId, provider.extensionId].sort()
            : [extensionId],
          kitId: declaration.id,
          requestedVersion: declaration.version,
          providerVersion: provider.version,
          message: `Extension "${extensionId}" requires Kit "${declaration.id}" ${declaration.version}, but ${providerName} provides ${provider.version}.`,
        })
      }
      if (compatible && !declaration.optional && provider.kind === 'extension') {
        dependencies.add(provider.extensionId)
      }
    }
  }

  const currentDependencies = buildLoadedDependencyGraph(input.loadedManifests)
  const dependencyCycles = [
    ...findDependencyCycles(enabledExtensionIds, dependenciesByExtensionId),
    ...findDependencyCycles(loadedExtensionIds, currentDependencies),
  ].sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
  const reportedDependencyCycles = new Set<string>()
  for (const cycle of dependencyCycles) {
    const cycleKey = cycle.join('\0')
    if (reportedDependencyCycles.has(cycleKey)) {
      continue
    }
    reportedDependencyCycles.add(cycleKey)
    diagnostics.push({
      code: 'dependency-cycle',
      extensionIds: cycle,
      message: `Required Kit dependencies form a cycle: ${cycle.map(extensionId => `"${extensionId}"`).join(', ')}.`,
    })
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics }
  }

  const targetLoadOrder = topologicallySort(enabledExtensionIds, dependenciesByExtensionId)
  const targetLoadedExtensionIdSet = new Set(targetLoadedExtensionIds)
  const restartDependencies = mergeDependencyGraphs(dependenciesByExtensionId, currentDependencies)
  const restartExtensionIds = collectRestartClosure(
    requestedRestartExtensionIds.filter(extensionId => targetLoadedExtensionIdSet.has(extensionId)),
    restartDependencies,
  ).filter(extensionId => targetLoadedExtensionIdSet.has(extensionId))
  const currentLoadOrder = topologicallySort(loadedExtensionIds, currentDependencies)
  const unloadExtensionIds = new Set(
    loadedExtensionIds.filter(extensionId => !targetLoadedExtensionIdSet.has(extensionId)),
  )
  const loadExtensionIds = new Set(
    targetLoadedExtensionIds.filter(extensionId => !loadedExtensionIdSet.has(extensionId)),
  )
  for (const extensionId of restartExtensionIds) {
    unloadExtensionIds.add(extensionId)
    loadExtensionIds.add(extensionId)
  }
  const unloadOrder = [...currentLoadOrder]
    .reverse()
    .filter(extensionId => unloadExtensionIds.has(extensionId))
  const loadOrder = targetLoadOrder.filter(extensionId => loadExtensionIds.has(extensionId))

  return {
    ok: true,
    plan: {
      enabledExtensionIds,
      targetLoadedExtensionIds,
      unloadOrder,
      loadOrder,
      restartExtensionIds,
      resolutions,
    },
  }
}

function mergeDependencyGraphs(
  ...graphs: ReadonlyArray<ReadonlyMap<string, ReadonlySet<string>>>
): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>()
  for (const graph of graphs) {
    for (const [extensionId, dependencyIds] of graph) {
      let dependencies = merged.get(extensionId)
      if (!dependencies) {
        dependencies = new Set<string>()
        merged.set(extensionId, dependencies)
      }
      for (const dependencyId of dependencyIds) {
        dependencies.add(dependencyId)
      }
    }
  }
  return merged
}

function collectRestartClosure(
  requestedExtensionIds: readonly string[],
  dependenciesByExtensionId: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const dependentsByExtensionId = new Map<string, Set<string>>()
  for (const [consumerExtensionId, providerExtensionIds] of dependenciesByExtensionId) {
    for (const providerExtensionId of providerExtensionIds) {
      let dependents = dependentsByExtensionId.get(providerExtensionId)
      if (!dependents) {
        dependents = new Set<string>()
        dependentsByExtensionId.set(providerExtensionId, dependents)
      }
      dependents.add(consumerExtensionId)
    }
  }

  const closure = new Set(requestedExtensionIds)
  const pending = [...requestedExtensionIds].sort()
  while (pending.length > 0) {
    const extensionId = pending.shift()
    if (!extensionId) {
      continue
    }
    const dependents = dependentsByExtensionId.get(extensionId)
    if (!dependents) {
      continue
    }
    for (const dependentId of [...dependents].sort()) {
      if (!closure.has(dependentId)) {
        closure.add(dependentId)
        pending.push(dependentId)
        pending.sort()
      }
    }
  }

  return [...closure].sort()
}

function buildLoadedDependencyGraph(
  loadedManifests: readonly ExtensionManifestV2[],
): Map<string, Set<string>> {
  const providersByKitId = new Map<string, Array<{ extensionId: string, version: string }>>()
  for (const manifest of [...loadedManifests].sort((left, right) => left.id.localeCompare(right.id))) {
    const providedKits = manifest.kits?.provides
    if (!providedKits) {
      continue
    }
    for (const declaration of providedKits) {
      let providers = providersByKitId.get(declaration.id)
      if (!providers) {
        providers = []
        providersByKitId.set(declaration.id, providers)
      }
      providers.push({ extensionId: manifest.id, version: declaration.version })
    }
  }

  const dependenciesByExtensionId = new Map<string, Set<string>>()
  for (const manifest of [...loadedManifests].sort((left, right) => left.id.localeCompare(right.id))) {
    let dependencies = dependenciesByExtensionId.get(manifest.id)
    if (!dependencies) {
      dependencies = new Set<string>()
      dependenciesByExtensionId.set(manifest.id, dependencies)
    }
    const declaredUses = manifest.kits?.uses
    if (!declaredUses) {
      continue
    }
    for (const declaration of declaredUses) {
      if (declaration.optional) {
        continue
      }
      const providers = providersByKitId.get(declaration.id)
      if (!providers) {
        continue
      }
      for (const provider of providers) {
        if (semver.satisfies(provider.version, declaration.version)) {
          dependencies.add(provider.extensionId)
        }
      }
    }
  }

  return dependenciesByExtensionId
}

function findDependencyCycles(
  extensionIds: readonly string[],
  dependenciesByExtensionId: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const indices = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []
  let nextIndex = 0

  function visit(extensionId: string): void {
    const currentIndex = nextIndex
    nextIndex += 1
    indices.set(extensionId, currentIndex)
    lowLinks.set(extensionId, currentIndex)
    stack.push(extensionId)
    onStack.add(extensionId)

    const dependencies = [...(dependenciesByExtensionId.get(extensionId) ?? emptyExtensionIdSet)].sort()
    for (const dependencyId of dependencies) {
      if (!indices.has(dependencyId)) {
        visit(dependencyId)
        lowLinks.set(extensionId, Math.min(
          lowLinks.get(extensionId) ?? currentIndex,
          lowLinks.get(dependencyId) ?? currentIndex,
        ))
      }
      else if (onStack.has(dependencyId)) {
        lowLinks.set(extensionId, Math.min(
          lowLinks.get(extensionId) ?? currentIndex,
          indices.get(dependencyId) ?? currentIndex,
        ))
      }
    }

    if (lowLinks.get(extensionId) !== indices.get(extensionId)) {
      return
    }

    const component: string[] = []
    let memberId: string | undefined
    do {
      memberId = stack.pop()
      if (memberId) {
        onStack.delete(memberId)
        component.push(memberId)
      }
    } while (memberId && memberId !== extensionId)

    const sortedComponent = component.sort()
    const hasSelfDependency = sortedComponent.length === 1
      && dependenciesByExtensionId.get(sortedComponent[0])?.has(sortedComponent[0])
    if (sortedComponent.length > 1 || hasSelfDependency) {
      cycles.push(sortedComponent)
    }
  }

  for (const extensionId of [...extensionIds].sort()) {
    if (!indices.has(extensionId)) {
      visit(extensionId)
    }
  }

  return cycles.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
}

function topologicallySort(
  extensionIds: readonly string[],
  dependenciesByExtensionId: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const remainingDependencies = new Map(
    extensionIds.map((extensionId) => {
      const dependencies = dependenciesByExtensionId.get(extensionId)
      return [
        extensionId,
        dependencies ? new Set(dependencies) : new Set<string>(),
      ] as const
    }),
  )
  const result: string[] = []

  while (remainingDependencies.size > 0) {
    const ready = [...remainingDependencies]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([extensionId]) => extensionId)
      .sort()

    const extensionId = ready[0]
    if (!extensionId) {
      // planExtensionActivation rejects cycles in the target and live graphs before sorting.
      throw new Error('Dependency graph must be acyclic before topological sorting.')
    }

    result.push(extensionId)
    remainingDependencies.delete(extensionId)
    for (const dependencies of remainingDependencies.values()) {
      dependencies.delete(extensionId)
    }
  }

  return result
}
