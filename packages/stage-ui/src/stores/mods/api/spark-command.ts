import type { WebSocketEvents } from '@proj-airi/server-sdk'

import { admitCommand } from '@proj-airi/core-agent'

import { useSchedulerStore } from '../../scheduler'
import { useModsServerChannelStore } from './channel-server'
import { useModuleDirectoryStore } from './module-directory'

/**
 * Admits one command from a run and sends it.
 *
 * Returns:
 * - Nothing after a send. A rejection names the reason and the modules that accept the intent.
 */
export function sendAdmittedSparkCommand(runId: string | undefined, command: WebSocketEvents['spark:command']): void | { rejected: string } {
  const scheduler = useSchedulerStore()
  const directory = useModuleDirectoryStore()
  const admission = admitCommand(command, {
    run: runId ? scheduler.runs.get(runId) : undefined,
    destinations: name => directory.byName(name),
    leases: scheduler.leases,
  })
  if (!admission.ok) {
    const accepting = directory.modules
      .filter(module => module.cognition?.accepts?.includes(command.intent) && !module.cognition.scenes?.length)
      .map(module => module.name)
    return { rejected: `${admission.reason}${admission.destination ? ` (${admission.destination})` : ''}. Modules that accept "${command.intent}": ${[...new Set(accepting)].join(', ') || 'none'}` }
  }

  useModsServerChannelStore().send({ type: 'spark:command', data: admission.command })
}
