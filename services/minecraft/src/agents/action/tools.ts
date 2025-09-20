import type { Action } from '../../libs/mineflayer'

import { z } from 'zod'

import { collectBlock } from '../../skills/actions/collect-block'
import { discard, equip, putInChest, takeFromChest, viewChest } from '../../skills/actions/inventory'
import { activateNearestBlock, placeBlock } from '../../skills/actions/world-interactions'
import { useLogger } from '../../utils/logger'

import * as skills from '../../skills'
import * as world from '../../skills/world'

// Utils
const pad = (str: string): string => `\n${str}\n`

function formatInventoryItem(item: string, count: number): string {
  return count > 0 ? `\n- ${item}: ${count}` : ''
}

function formatWearingItem(slot: string, item: string | undefined): string {
  return item ? `\n${slot}: ${item}` : ''
}

export const actionsList: Action[] = [
  {
    name: 'stats',
    description: 'Get your bot\'s location, health, hunger, and time of day.',
    schema: z.object({}),
    perform: mineflayer => (): string => {
      const status = mineflayer.status.toOneLiner()
      return status
    },
  },
  {
    name: 'inventory',
    description: 'Get your bot\'s inventory.',
    schema: z.object({}),
    perform: mineflayer => (): string => {
      const inventory = world.getInventoryCounts(mineflayer)
      const items = Object.entries(inventory)
        .map(([item, count]) => formatInventoryItem(item, count))
        .join('')

      const wearing = [
        formatWearingItem('Head', mineflayer.bot.inventory.slots[5]?.name),
        formatWearingItem('Torso', mineflayer.bot.inventory.slots[6]?.name),
        formatWearingItem('Legs', mineflayer.bot.inventory.slots[7]?.name),
        formatWearingItem('Feet', mineflayer.bot.inventory.slots[8]?.name),
      ].filter(Boolean).join('')

      return pad(`INVENTORY${items || ': Nothing'}
  ${mineflayer.bot.game.gameMode === 'creative' ? '\n(You have infinite items in creative mode. You do not need to gather resources!!)' : ''}
  WEARING: ${wearing || 'Nothing'}`)
    },
  },
  {
    name: 'nearbyBlocks',
    description: 'Get the blocks near the bot.',
    schema: z.object({}),
    perform: mineflayer => (): string => {
      const blocks = world.getNearbyBlockTypes(mineflayer)
      useLogger().withFields({ blocks }).log('nearbyBlocks')
      return pad(`NEARBY_BLOCKS${blocks.map((b: string) => `\n- ${b}`).join('') || ': none'}`)
    },
  },
  {
    name: 'craftable',
    description: 'Get the craftable items with the bot\'s inventory.',
    schema: z.object({}),
    perform: mineflayer => (): string => {
      const craftable = world.getCraftableItems(mineflayer)
      return pad(`CRAFTABLE_ITEMS${craftable.map((i: string) => `\n- ${i}`).join('') || ': none'}`)
    },
  },
  {
    name: 'entities',
    description: 'Get the nearby players and entities.',
    schema: z.object({}),
    perform: mineflayer => (): string => {
      const players = world.getNearbyPlayerNames(mineflayer)
      const entities = world.getNearbyEntityTypes(mineflayer)
        .filter((e: string) => e !== 'player' && e !== 'item')

      const result = [
        ...players.map((p: string) => `- Human player: ${p}`),
        ...entities.map((e: string) => `- entities: ${e}`),
      ]

      return pad(`NEARBY_ENTITIES${result.length ? `\n${result.join('\n')}` : ': none'}`)
    },
  },
  // getNewAction(): Action {
  //   return {
  //     name: 'newAction',
  //     description: 'Perform new and unknown custom behaviors that are not available as a command.',
  //     schema: z.object({
  //       prompt: z.string().describe('A natural language prompt to guide code generation. Make a detailed step-by-step plan.'),
  //     }),
  //     perform: (mineflayer: BotContext) => async (prompt: string) => {
  //       if (!settings.allow_insecure_coding)
  //         return 'newAction not allowed! Code writing is disabled in settings. Notify the user.'
  //       return await ctx.coder.generateCode(mineflayer.history)
  //     },
  //   }
  // },

  // todo: must 'stop now' can be used to stop the agent
  {
    name: 'stop',
    description: 'Force stop all actions and commands that are currently executing.',
    schema: z.object({}),
    perform: mineflayer => async () => {
      // await ctx.actions.stop()
      // ctx.clearBotLogs()
      // ctx.actions.cancelResume()
      // ctx.bot.emit('idle')

      mineflayer.emit('interrupt')

      const msg = 'Agent stopped.'
      // if (mineflayer.self_prompter.on)
      //   msg += ' Self-prompting still active.'
      return msg
    },
  },

  // getStfuAction(): Action {
  //   return {
  //     name: 'stfu',
  //     description: 'Stop all chatting and self prompting, but continue current action.',
  //     schema: z.object({}),
  //     perform: (mineflayer: BotContext) => async () => {
  //       ctx.openChat('Shutting up.')
  //       ctx.shutUp()
  //       return 'Shutting up.'
  //     },
  //   }
  // },

  // getRestartAction(): Action {
  //   return {
  //     name: 'restart',
  //     description: 'Restart the agent process.',
  //     schema: z.object({}),
  //     perform: (mineflayer: BotContext) => async () => {
  //       ctx.cleanKill()
  //       return 'Restarting agent...'
  //     },
  //   }
  // },

  // getClearChatAction(): Action {
  //   return {
  //     name: 'clearChat',
  //     description: 'Clear the chat history.',
  //     schema: z.object({}),
  //     perform: (mineflayer: BotContext) => async () => {
  //       ctx.history.clear()
  //       return `${ctx.name}'s chat history was cleared, starting new conversation from scratch.`
  //     },
  //   }
  // },
  {
    name: 'goToPlayer',
    description: 'Go to the given player.',
    schema: z.object({
      player_name: z.string().describe('The name of the player to go to.'),
      closeness: z.number().describe('How close to get to the player.').min(0),
    }),
    perform: mineflayer => async (player_name: string, closeness: number) => {
      await skills.goToPlayer(mineflayer, player_name, closeness)
      return 'Moving to player...'
    },
  },

  {
    name: 'followPlayer',
    description: 'Endlessly follow the given player.',
    schema: z.object({
      player_name: z.string().describe('name of the player to follow.'),
      follow_dist: z.number().describe('The distance to follow from.').min(0),
    }),
    perform: mineflayer => async (player_name: string, follow_dist: number) => {
      await skills.followPlayer(mineflayer, player_name, follow_dist)
      return 'Following player...'
    },
  },

  {
    name: 'goToCoordinates',
    description: 'Go to the given x, y, z location.',
    schema: z.object({
      x: z.number().describe('The x coordinate.'),
      y: z.number().describe('The y coordinate.').min(-64).max(320),
      z: z.number().describe('The z coordinate.'),
      closeness: z.number().describe('How close to get to the location.').min(0),
    }),
    perform: mineflayer => async (x: number, y: number, z: number, closeness: number) => {
      await skills.goToPosition(mineflayer, x, y, z, closeness)
      return 'Moving to coordinates...'
    },
  },

  {
    name: 'searchForBlock',
    description: 'Find and go to the nearest block of a given type in a given range.',
    schema: z.object({
      type: z.string().describe('The block type to go to.'),
      search_range: z.number().describe('The range to search for the block.').min(32).max(512),
    }),
    perform: mineflayer => async (block_type: string, range: number) => {
      await skills.goToNearestBlock(mineflayer, block_type, 4, range)
      return 'Searching for block...'
    },
  },

  {
    name: 'searchForEntity',
    description: 'Find and go to the nearest entity of a given type in a given range.',
    schema: z.object({
      type: z.string().describe('The type of entity to go to.'),
      search_range: z.number().describe('The range to search for the entity.').min(32).max(512),
    }),
    perform: mineflayer => async (entity_type: string, range: number) => {
      await skills.goToNearestEntity(mineflayer, entity_type, 4, range)
      return 'Searching for entity...'
    },
  },

  {
    name: 'moveAway',
    description: 'Move away from the current location in any direction by a given distance.',
    schema: z.object({
      distance: z.number().describe('The distance to move away.').min(0),
    }),
    perform: mineflayer => async (distance: number) => {
      await skills.moveAway(mineflayer, distance)
      return 'Moving away...'
    },
  },

  {
    name: 'givePlayer',
    description: 'Give the specified item to the given player.',
    schema: z.object({
      player_name: z.string().describe('The name of the player to give the item to.'),
      item_name: z.string().describe('The name of the item to give.'),
      num: z.number().int().describe('The number of items to give.').min(1),
    }),
    perform: mineflayer => async (player_name: string, item_name: string, num: number) => {
      await skills.giveToPlayer(mineflayer, item_name, player_name, num)
      return 'Giving items to player...'
    },
  },

  {
    name: 'consume',
    description: 'Eat/drink the given item.',
    schema: z.object({
      item_name: z.string().describe('The name of the item to consume.'),
    }),
    perform: mineflayer => async (item_name: string) => {
      await skills.consume(mineflayer, item_name)
      return 'Consuming item...'
    },
  },

  {
    name: 'equip',
    description: 'Equip the given item.',
    schema: z.object({
      item_name: z.string().describe('The name of the item to equip.'),
    }),
    perform: mineflayer => async (item_name: string) => {
      await equip(mineflayer, item_name)
      return 'Equipping item...'
    },
  },

  {
    name: 'putInChest',
    description: 'Put the given item in the nearest chest.',
    schema: z.object({
      item_name: z.string().describe('The name of the item to put in the chest.'),
      num: z.number().int().describe('The number of items to put in the chest.').min(1),
    }),
    perform: mineflayer => async (item_name: string, num: number) => {
      await putInChest(mineflayer, item_name, num)
      return 'Putting items in chest...'
    },
  },

  {
    name: 'takeFromChest',
    description: 'Take the given items from the nearest chest.',
    schema: z.object({
      item_name: z.string().describe('The name of the item to take.'),
      num: z.number().int().describe('The number of items to take.').min(1),
    }),
    perform: mineflayer => async (item_name: string, num: number) => {
      await takeFromChest(mineflayer, item_name, num)
      return 'Taking items from chest...'
    },
  },

  {
    name: 'viewChest',
    description: 'View the items/counts of the nearest chest.',
    schema: z.object({}),
    perform: mineflayer => async () => {
      await viewChest(mineflayer)
      return 'Viewing chest contents...'
    },
  },

  {
    name: 'discard',
    description: 'Discard the given item from the inventory.',
    schema: z.object({
      item_name: z.string().describe('The name of the item to discard.'),
      num: z.number().int().describe('The number of items to discard.').min(1),
    }),
    perform: mineflayer => async (item_name: string, num: number) => {
      await discard(mineflayer, item_name, num)
      return 'Discarding items...'
    },
  },

  {
    name: 'collectBlocks',
    description: 'Collect the nearest blocks of a given type.',
    schema: z.object({
      type: z.string().describe('The block type to collect.'),
      num: z.number().int().describe('The number of blocks to collect.').min(1),
    }),
    perform: mineflayer => async (type: string, num: number) => {
      await collectBlock(mineflayer, type, num)
      return 'Collecting blocks...'
    },
  },

  {
    name: 'craftRecipe',
    description: 'Craft the given recipe a given number of times.',
    schema: z.object({
      recipe_name: z.string().describe('The name of the output item to craft.'),
      num: z.number().int().describe('The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.').min(1),
    }),
    perform: mineflayer => async (recipe_name: string, num: number) => {
      await skills.craftRecipe(mineflayer, recipe_name, num)
      return 'Crafting items...'
    },
  },

  {
    name: 'smeltItem',
    description: 'Smelt the given item the given number of times.',
    schema: z.object({
      item_name: z.string().describe('The name of the input item to smelt.'),
      num: z.number().int().describe('The number of times to smelt the item.').min(1),
    }),
    perform: mineflayer => async (item_name: string, num: number) => {
      await skills.smeltItem(mineflayer, item_name, num)
      return 'Smelting items...'
    },
  },

  {
    name: 'clearFurnace',
    description: 'Take all items out of the nearest furnace.',
    schema: z.object({}),
    perform: mineflayer => async () => {
      await skills.clearNearestFurnace(mineflayer)
      return 'Clearing furnace...'
    },
  },

  {
    name: 'placeHere',
    description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
    schema: z.object({
      type: z.string().describe('The block type to place.'),
    }),
    perform: mineflayer => async (type: string) => {
      const pos = mineflayer.bot.entity.position
      await placeBlock(mineflayer, type, pos.x, pos.y, pos.z)
      return 'Placing block...'
    },
  },

  {
    name: 'attack',
    description: 'Attack and kill the nearest entity of a given type.',
    schema: z.object({
      type: z.string().describe('The type of entity to attack.'),
    }),
    perform: mineflayer => async (type: string) => {
      await skills.attackNearest(mineflayer, type, true)
      return 'Attacking entity...'
    },
  },

  {
    name: 'attackPlayer',
    description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
    schema: z.object({
      player_name: z.string().describe('The name of the player to attack.'),
    }),
    perform: mineflayer => async (player_name: string) => {
      const player = mineflayer.bot.players[player_name]?.entity
      if (!player) {
        skills.log(mineflayer, `Could not find player ${player_name}.`)
        return 'Player not found'
      }
      await skills.attackEntity(mineflayer, player, true)
      return 'Attacking player...'
    },
  },

  {
    name: 'goToBed',
    description: 'Go to the nearest bed and sleep.',
    schema: z.object({}),
    perform: mineflayer => async () => {
      await skills.goToBed(mineflayer)
      return 'Going to bed...'
    },
  },

  {
    name: 'activate',
    description: 'Activate the nearest object of a given type.',
    schema: z.object({
      type: z.string().describe('The type of object to activate.'),
    }),
    perform: mineflayer => async (type: string) => {
      await activateNearestBlock(mineflayer, type)
      return 'Activating block...'
    },
  },

  {
    name: 'stay',
    description: 'Stay in the current location no matter what. Pauses all modes.',
    schema: z.object({
      type: z.number().int().describe('The number of seconds to stay. -1 for forever.').min(-1),
    }),
    perform: mineflayer => async (seconds: number) => {
      await skills.stay(mineflayer, seconds)
      return 'Staying in place...'
    },
  },
  // getSetModeAction(): Action {
  //   return {
  //     name: 'setMode',
  //     description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
  //     schema: z.object({
  //       mode_name: z.string().describe('The name of the mode to enable.'),
  //       on: z.boolean().describe('Whether to enable or disable the mode.'),
  //     }),
  //     perform: (mineflayer: BotContext) => async (mode_name: string, on: boolean) => {
  //       const modes = ctx.bot.modes
  //       if (!modes.exists(mode_name))
  //         return `Mode ${mode_name} does not exist.${modes.getDocs()}`
  //       if (modes.isOn(mode_name) === on)
  //         return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`
  //       modes.setOn(mode_name, on)
  //       return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`
  //     },
  //   }
  // },

  // getGoalAction(): Action {
  //   return {
  //     name: 'goal',
  //     description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
  //     schema: z.object({
  //       selfPrompt: z.string().describe('The goal prompt.'),
  //     }),
  //     perform: (mineflayer: BotContext) => async (prompt: string) => {
  //       if (convoManager.inConversation()) {
  //         ctx.self_prompter.setPrompt(prompt)
  //         convoManager.scheduleSelfPrompter()
  //       }
  //       else {
  //         ctx.self_prompter.start(prompt)
  //       }
  //       return 'Goal set...'
  //     },
  //   }
  // },

  // getEndGoalAction(): Action {
  //   return {
  //     name: 'endGoal',
  //     description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action.',
  //     schema: z.object({}),
  //     perform: (mineflayer: BotContext) => async () => {
  //       ctx.self_prompter.stop()
  //       convoManager.cancelSelfPrompter()
  //       return 'Self-prompting stopped.'
  //     },
  //   }
  // },

  // getStartConversationAction(): Action {
  //   return {
  //     name: 'startConversation',
  //     description: 'Start a conversation with a player. Use for bots only.',
  //     schema: z.object({
  //       player_name: z.string().describe('The name of the player to send the message to.'),
  //       message: z.string().describe('The message to send.'),
  //     }),
  //     perform: (mineflayer: BotContext) => async (player_name: string, message: string) => {
  //       if (!convoManager.isOtherAgent(player_name))
  //         return `${player_name} is not a bot, cannot start conversation.`
  //       if (convoManager.inConversation() && !convoManager.inConversation(player_name))
  //         convoManager.forceEndCurrentConversation()
  //       else if (convoManager.inConversation(player_name))
  //         ctx.history.add('system', `You are already in conversation with ${player_name}. Don't use this command to talk to them.`)
  //       convoManager.startConversation(player_name, message)
  //     },
  //   }
  // },

  // getEndConversationAction(): Action {
  //   return {
  //     name: 'endConversation',
  //     description: 'End the conversation with the given player.',
  //     schema: z.object({
  //       player_name: z.string().describe('The name of the player to end the conversation with.'),
  //     }),
  //     perform: (mineflayer: BotContext) => async (player_name: string) => {
  //       if (!convoManager.inConversation(player_name))
  //         return `Not in conversation with ${player_name}.`
  //       convoManager.endConversation(player_name)
  //       return `Converstaion with ${player_name} ended.`
  //     },
  //   }
  // },
]
