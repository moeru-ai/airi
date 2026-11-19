import type { ExtensionManifestV2, PluginRuntime } from './shared/types'

import semver from 'semver'

/** Stable code for one rejected activation configuration. */
export type ActivationDiagnosticCode
  = | 'duplicate-installed-extension'
    | 'enabled-extension-not-installed'
    | 'incompatible-airi-version'
    | 'incompatible-runtime'

/** Describes one reason that prevents an activation. */
export interface ActivationDiagnostic {
  /** Stable code for caller control flow. */
  code: ActivationDiagnosticCode
  /** Extension identifiers related to the error. */
  extensionIds: string[]
  /** AIRI version range requested by the Extension. */
  requestedVersion?: string
  /** AIRI version that the Host runs. */
  providerVersion?: string
  /** Human-readable error description. */
  message: string
}

/** Contains the installed Manifests and the Extensions to activate. */
export interface ActivationCheckInput {
  /** Manifests available for the target configuration. */
  installedManifests: readonly ExtensionManifestV2[]
  /** Extensions that the caller wants to enable or load. */
  enabledExtensionIds: readonly string[]
  /** Runtime that will load the Extensions. */
  runtime: PluginRuntime
  /** Running AIRI version. When omitted, the check skips AIRI compatibility. @default undefined */
  airiVersion?: string
}

/**
 * Checks the Manifests of the Extensions to activate, without runtime side effects.
 *
 * It checks duplicate installed ids, installation, runtime support, and AIRI version compatibility.
 * A required Kit without a Provider is not an error: the session of that Extension waits in `pending`.
 */
export function checkExtensionActivation(input: ActivationCheckInput): ActivationDiagnostic[] {
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

  const installedById = new Map(input.installedManifests.map(manifest => [manifest.id, manifest]))
  for (const extensionId of [...new Set(input.enabledExtensionIds)].sort()) {
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

  return diagnostics
}
