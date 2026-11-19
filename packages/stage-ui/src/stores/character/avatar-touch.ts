import type {} from 'pinia-plugin-synced'

import type { AvatarTouchSummary } from '../../libs/avatar-touch/notify'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'

import { createAvatarTouchCooldown, toAvatarTouchSparkNotify } from '../../libs/avatar-touch/notify'
import { useCharacterOrchestratorStore } from './orchestrator'

/**
 * Tells the character about touches on its avatar, through `spark:notify`.
 *
 * `notifyTouch` is a leader-routed action. The window that renders the avatar
 * can be a follower, and only the leader consumes the notify queue, so the
 * leader receives every touch. The leader also owns the cooldown, so two
 * windows that show the avatar share one cooldown for each region.
 */
export const useAvatarTouchStore = defineStore('avatar-touch', () => {
  const cooldown = createAvatarTouchCooldown()

  async function notifyTouch(summary: AvatarTouchSummary): Promise<'cooldown' | 'sent'> {
    if (!cooldown.allow(summary.region, Date.now()))
      return 'cooldown'

    await useCharacterOrchestratorStore().handleSparkNotify(toAvatarTouchSparkNotify(summary, `avatar-touch:${nanoid()}`))
    return 'sent'
  }

  return { notifyTouch }
}, {
  synced: {
    actions: ['notifyTouch'],
  },
})
