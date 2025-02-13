import type { Mineflayer } from '../mineflayer'

import { listInventory } from '../../skills/actions/inventory'

export async function generateStatusPrompt(mineflayer: Mineflayer): Promise<string> {
  // Get inventory items
  const inventory = await listInventory(mineflayer)

  // Format inventory string
  const inventoryStr = inventory.length === 0
    ? '[Empty]'
    : inventory.map(item => `${item.name} x ${item.count}`).join(', ')

  // Get currently held item
  const itemInHand = inventory.length === 0
    ? '[Empty]'
    : `${inventory[0].name} x ${inventory[0].count}` // TODO: mock

  // Build status message
  return [
    'I will give you the following information:',
    mineflayer.status.toOneLiner(),
    '',
    'Inventory:',
    inventoryStr,
    '',
    'Item in hand:',
    itemInHand,
  ].join('\n')
}

export function generateSystemBasicPrompt(botName: string): string {
  // ${ctx.prompt.selfPrompt}
  return `You are a playful Minecraft bot named ${botName} that can converse with players, see, move,
mine, build, and interact with the world by using commands.`
}

export function generateActionAgentPrompt(mineflayer: Mineflayer): string {
  return `${generateSystemBasicPrompt(mineflayer.username)}

Act human-like as if you were a typical Minecraft player, rather than an AI. Be very brief in
your responses, don't apologize constantly, don't give instructions or make lists unless
asked, and don't refuse requests.

Do not use any emojis. Just call the function given you if needed.

- If I command you 'stop', then call the 'stop' function.
- If I require you to find something, then call the 'nearbyBlocks' function first, then call the 'searchForBlock' function.
`
}
