import { definePerceptionEvent } from '..'

interface PlayerJoinedExtract {
  playerId: string
  displayName?: string
}

const knownPlayerIds = new Set<string>()

export const playerJoinedEvent = definePerceptionEvent<[any], PlayerJoinedExtract>({
  id: 'player_joined',
  modality: 'system',
  kind: 'player_joined',

  mineflayer: {
    event: 'playerJoined',
    filter: (ctx, player) => {
      if (!player)
        return false
      if (ctx.isSelf(player))
        return false

      const playerId = ctx.entityId(player)
      if (knownPlayerIds.has(playerId))
        return false

      knownPlayerIds.add(playerId)
      return true
    },
    extract: (ctx, player) => ({
      playerId: ctx.entityId(player),
      displayName: player?.username,
    }),
  },

  saliency: {
    threshold: 1,
    key: 'system:player_joined',
  },

  signal: {
    type: 'social_presence',
    description: extracted => `Player ${extracted.displayName || 'unknown'} joined the game`,
    metadata: extracted => ({
      playerId: extracted.playerId,
      displayName: extracted.displayName,
      action: 'joined',
    }),
  },

  routes: ['conscious', 'reflex'],
})
