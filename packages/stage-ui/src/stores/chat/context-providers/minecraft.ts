import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useMinecraftStore } from '../../modules/gaming-minecraft'

const MINECRAFT_CONTEXT_ID = 'system:minecraft-integration'

/**
 * Creates a lightweight self-knowledge context for the AIRI/Minecraft shell.
 * This gives the chat model stable instructions about how the integration works,
 * while runtime state still arrives separately through live context updates.
 */
export function createMinecraftContext(): ContextMessage | null {
  const minecraftStore = useMinecraftStore()
  minecraftStore.initialize()

  if (!minecraftStore.integrationEnabled)
    return null

  const statusSnapshot = minecraftStore.statusSnapshot
  const status = minecraftStore.botState || 'disconnected'
  // TODO: Trim stale runtime target details once we have a first-class freshness policy
  // for passive Minecraft context snapshots.
  const targetHost = statusSnapshot?.editableConfig?.host ?? statusSnapshot?.host
  const targetPort = statusSnapshot?.editableConfig?.port ?? statusSnapshot?.port
  const target = targetHost
    ? `${targetHost}:${targetPort ?? 'unknown'}`
    : 'unknown server'

  return {
    id: nanoid(),
    contextId: MINECRAFT_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: [
      'Minecraft integration is enabled.',
      'AIRI can oversee a connected Minecraft bot through AIRI server events.',
      'Minecraft can send status and context upward, and AIRI can send high-level guidance back down.',
      'Minecraft status/context updates are side context for the next turn and do not automatically trigger a new LLM response.',
      `Current bot status: ${status}.`,
      `Configured Minecraft target: ${target}.`,
      status === 'connected'
        ? 'The Minecraft bot is currently online, so AIRI may coordinate with it.'
        : 'Do not assume the Minecraft bot can act right now unless live runtime context confirms it is connected.',
    ].join(' '),
    createdAt: Date.now(),
  }
}
