import type { ServiceBlocker, ServiceExplanation } from 'injeca'

import { errorMessageFrom } from '@moeru/std'

function kitIdOfKey(key: string): string | undefined {
  if (!key.startsWith('kit:'))
    return undefined
  const id = key.slice('kit:'.length)
  const at = id.lastIndexOf('@')
  return at === -1 ? id : id.slice(0, at)
}

function describeProviderOwner(owner: Readonly<Record<string, unknown>>): string {
  if (owner.kind === 'plugin')
    return `plugin \`${String(owner.pluginId)}\``
  if (owner.kind === 'module')
    return `module \`${String(owner.moduleId)}\` of plugin \`${String(owner.pluginId)}\``
  return 'the Host'
}

/**
 * Turns one injeca blocker into one sentence for plugin authors and the plugin page.
 *
 * @example
 * describeBlocker({ kind: 'missing-provider', dependency: 'kit:airi.fs-store', key: 'kit:airi.fs-store' })
 * // => 'No provider of Kit `airi.fs-store` is installed.'
 */
export function describeBlocker(blocker: ServiceBlocker): string {
  switch (blocker.kind) {
    case 'missing-provider': {
      const kitId = kitIdOfKey(blocker.key)
      return kitId ? `No provider of Kit \`${kitId}\` is installed.` : `\`${blocker.key}\` has no provider.`
    }
    case 'rejected-provider': {
      const kitId = kitIdOfKey(blocker.key)
      const providers = Array.isArray(blocker.metadata.providers)
        ? (blocker.metadata.providers as { id: string, version: string }[]).map(provider => `${provider.id} ${provider.version}`).join(', ')
        : String(blocker.metadata.version ?? 'unknown')
      return `No provider of Kit \`${kitId ?? blocker.key}\` has a version in the range. The providers are: ${providers}.`
    }
    case 'failed-dependency':
      return `\`${blocker.key}\` failed: ${errorMessageFrom(blocker.error) ?? 'unknown error'}`
    case 'pending-dependency':
      return `\`${blocker.key}\` is ${blocker.phase}.`
    case 'unavailable-dependency':
      return `\`${blocker.key}\` is unavailable${blocker.cause.reason ? `: ${blocker.cause.reason}` : ''}.`
    case 'conflicting-dependency':
      return `\`${blocker.key}\` has more than one provider: ${blocker.owners.map(describeProviderOwner).join(', ')}.`
    case 'conflict':
      return `\`${blocker.key}\` has more than one provider: ${blocker.owners.map(describeProviderOwner).join(', ')}.`
    case 'failed':
      return `It failed: ${errorMessageFrom(blocker.error) ?? 'unknown error'}`
    case 'retrying':
      return `It retries (attempt ${blocker.attempt})${blocker.reason ? `: ${blocker.reason}` : ''}.`
    case 'not-started':
      return 'It is not started.'
  }
}

/** Turns one injeca explanation into one line. */
export function describeExplanation(explanation: ServiceExplanation): string {
  const state = explanation.phase === 'running' ? `running (${explanation.status ?? 'ready'})` : explanation.phase ?? 'missing'
  if (explanation.blockers.length === 0)
    return `\`${explanation.name}\` is ${state}.`
  return `\`${explanation.name}\` is ${state}. ${explanation.blockers.map(describeBlocker).join(' ')}`
}
