import type { Mineflayer } from '../../libs/mineflayer'

import { useLogger } from '../../utils/logger'
import { getItemId } from '../../utils/mcdata'
import { craftRecipe } from '../crafting'
import { moveAway } from '../movement'
import { collectBlock } from './collect-block'
import { gatherWood } from './gather-wood'
import { getItemCount } from './inventory'

// Constants for crafting and gathering
const PLANKS_PER_LOG = 4
const STICKS_PER_PLANK = 2
const logger = useLogger()

// Helper function to ensure a crafting table
export async function ensureCraftingTable(mineflayer: Mineflayer): Promise<boolean> {
  logger.log('Bot: Checking for a crafting table...')

  let hasCraftingTable = getItemCount(mineflayer, 'crafting_table') > 0

  if (hasCraftingTable) {
    logger.log('Bot: Crafting table is available.')
    return true
  }

  while (!hasCraftingTable) {
    const planksEnsured = await ensurePlanks(mineflayer, 4)
    if (!planksEnsured) {
      logger.error('Bot: Failed to ensure planks.')
      continue
    }

    // Craft crafting table
    hasCraftingTable = await craftRecipe(mineflayer, 'crafting_table', 1)
    if (hasCraftingTable) {
      mineflayer.bot.chat('I have made a crafting table.')
      logger.log('Bot: Crafting table crafted.')
    }
    else {
      logger.error('Bot: Failed to craft crafting table.')
    }
  }

  return hasCraftingTable
}

// Helper function to ensure a specific amount of planks
export async function ensurePlanks(mineflayer: Mineflayer, neededAmount: number): Promise<boolean> {
  logger.log('Bot: Checking for planks...')

  let planksCount = getItemCount(mineflayer, 'planks')

  if (neededAmount < planksCount) {
    logger.log('Bot: Have enough planks.')
    return true
  }

  while (neededAmount > planksCount) {
    const logsNeeded = Math.ceil((neededAmount - planksCount) / PLANKS_PER_LOG)

    // Get all available log types in inventory
    const availableLogs = mineflayer.bot.inventory
      .items()
      .filter(item => item.name.includes('log'))

    // If no logs available, gather more wood
    if (availableLogs.length === 0) {
      await gatherWood(mineflayer, logsNeeded, 80)
      logger.error('Bot: Not enough logs for planks.')
      continue
    }

    // Iterate over each log type to craft planks
    for (const log of availableLogs) {
      const logType = log.name.replace('_log', '') // Get log type without "_log" suffix
      const logsToCraft = Math.min(log.count, logsNeeded)

      logger.log(
        `Trying to make ${logsToCraft * PLANKS_PER_LOG} ${logType}_planks`,
      )
      logger.log(`NeededAmount: ${neededAmount}, while I have ${planksCount}`)

      const crafted = await craftRecipe(
        mineflayer,
        `${logType}_planks`,
        logsToCraft * PLANKS_PER_LOG,
      )
      if (crafted) {
        planksCount = getItemCount(mineflayer, 'planks')
        mineflayer.bot.chat(
          `I have crafted ${logsToCraft * PLANKS_PER_LOG} ${logType} planks.`,
        )
        logger.log(`Bot: ${logType} planks crafted.`)
      }
      else {
        logger.error(`Bot: Failed to craft ${logType} planks.`)
        return false
      }

      // Check if we have enough planks after crafting
      if (planksCount >= neededAmount)
        break
    }
  }

  return planksCount >= neededAmount
};

// Helper function to ensure a specific amount of sticks
export async function ensureSticks(mineflayer: Mineflayer, neededAmount: number): Promise<boolean> {
  logger.log('Bot: Checking for sticks...')

  let sticksCount = getItemCount(mineflayer, 'stick')

  if (neededAmount <= sticksCount) {
    logger.log('Bot: Have enough sticks.')
    return true
  }

  while (neededAmount >= sticksCount) {
    const planksCount = getItemCount(mineflayer, 'planks')
    const planksNeeded = Math.max(
      Math.ceil((neededAmount - sticksCount) / STICKS_PER_PLANK),
      4,
    )

    if (planksCount >= planksNeeded) {
      try {
        const sticksId = getItemId('stick')
        const recipe = await mineflayer.bot.recipesFor(sticksId, null, 1, null)[0]
        await mineflayer.bot.craft(recipe, neededAmount - sticksCount)
        sticksCount = getItemCount(mineflayer, 'stick')
        mineflayer.bot.chat(`I have made ${Math.abs(neededAmount - sticksCount)} sticks.`)
        logger.log(`Bot: Sticks crafted.`)
      }
      catch (err) {
        logger.withError(err).error('Bot: Failed to craft sticks.')
        return false
      }
    }
    else {
      await ensurePlanks(mineflayer, planksNeeded)
      logger.error('Bot: Not enough planks for sticks.')
    }
  }

  return sticksCount >= neededAmount
}

// Ensure a specific number of chests
export async function ensureChests(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} chest(s)...`)

  // Count the number of chests the bot already has
  let chestCount = getItemCount(mineflayer, 'chest')

  if (chestCount >= quantity) {
    logger.log(`Bot: Already has ${quantity} or more chest(s).`)
    return true
  }

  while (chestCount < quantity) {
    const planksEnsured = await ensurePlanks(mineflayer, 8 * quantity) // 8 planks per chest
    if (!planksEnsured) {
      logger.error('Bot: Failed to ensure planks for chest(s).')
      continue
    }

    // Craft the chest(s)
    const crafted = await craftRecipe(mineflayer, 'chest', quantity - chestCount)
    if (crafted) {
      chestCount = getItemCount(mineflayer, 'chest')
      mineflayer.bot.chat(`I have crafted ${quantity} chest(s).`)
      logger.log(`Bot: ${quantity} chest(s) crafted.`)
      continue
    }
    else {
      logger.error('Bot: Failed to craft chest(s).')
    }
  }
  return chestCount >= quantity
}

// Ensure a specific number of furnaces
export async function ensureFurnaces(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} furnace(s)...`)

  // Count the number of furnaces the bot already has
  let furnaceCount = getItemCount(mineflayer, 'furnace')

  if (furnaceCount >= quantity) {
    logger.log(`Bot: Already has ${quantity} or more furnace(s).`)
    return true
  }

  while (furnaceCount < quantity) {
    const stoneEnsured = await ensureCobblestone(mineflayer, 8 * (quantity - furnaceCount)) // 8 stone blocks per furnace
    if (!stoneEnsured) {
      logger.error('Bot: Failed to ensure stone for furnace(s).')
      continue
    }

    // Craft the furnace(s)
    const crafted = await craftRecipe(mineflayer, 'furnace', quantity - furnaceCount)
    if (crafted) {
      furnaceCount = getItemCount(mineflayer, 'furnace')
      mineflayer.bot.chat(`I have crafted ${quantity} furnace(s).`)
      logger.log(`Bot: ${quantity} furnace(s) crafted.`)
      continue
    }
    else {
      logger.error('Bot: Failed to craft furnace(s).')
    }
  }
  return furnaceCount >= quantity
}

// Ensure a specific number of torches
export async function ensureTorches(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} torch(es)...`)

  // Count the number of torches the bot already has
  let torchCount = getItemCount(mineflayer, 'torch')

  if (torchCount >= quantity) {
    logger.log(`Bot: Already has ${quantity} or more torch(es).`)
    return true
  }

  while (torchCount < quantity) {
    const sticksEnsured = await ensureSticks(mineflayer, quantity - torchCount) // 1 stick per 4 torches
    const coalEnsured = await ensureCoal(
      mineflayer,
      Math.ceil((quantity - torchCount) / 4),
    ) // 1 coal per 4 torches

    if (!sticksEnsured || !coalEnsured) {
      logger.error('Bot: Failed to ensure sticks or coal for torch(es).')
      continue
    }

    // Craft the torch(es)
    const crafted = await craftRecipe(mineflayer, 'torch', quantity - torchCount)
    if (crafted) {
      torchCount = getItemCount(mineflayer, 'torch')
      mineflayer.bot.chat(`I have crafted ${quantity} torch(es).`)
      logger.log(`Bot: ${quantity} torch(es) crafted.`)
      continue
    }
    else {
      logger.error('Bot: Failed to craft torch(es).')
    }
  }
  return torchCount >= quantity
}

// Ensure a campfire
// Todo: rework
export async function ensureCampfire(mineflayer: Mineflayer): Promise<boolean> {
  logger.log('Bot: Checking for a campfire...')

  const hasCampfire = getItemCount(mineflayer, 'campfire') > 0

  if (hasCampfire) {
    logger.log('Bot: Campfire is already available.')
    return true
  }

  const logsEnsured = await ensurePlanks(mineflayer, 3) // Need 3 logs for a campfire
  const sticksEnsured = await ensureSticks(mineflayer, 3) // Need 3 sticks for a campfire
  const coalEnsured = await ensureCoal(mineflayer, 1) // Need 1 coal or charcoal for a campfire

  if (!logsEnsured || !sticksEnsured || !coalEnsured) {
    logger.error('Bot: Failed to ensure resources for campfire.')
  }

  const crafted = await craftRecipe(mineflayer, 'campfire', 1)
  if (crafted) {
    mineflayer.bot.chat('I have crafted a campfire.')
    logger.log('Bot: Campfire crafted.')
    return true
  }
  else {
    logger.error('Bot: Failed to craft campfire.')
  }

  return hasCampfire
}

// Helper function to gather cobblestone
export async function ensureCobblestone(mineflayer: Mineflayer, requiredCobblestone: number, maxDistance: number = 4): Promise<boolean> {
  let cobblestoneCount = getItemCount(mineflayer, 'cobblestone')

  while (cobblestoneCount < requiredCobblestone) {
    logger.log('Bot: Gathering more cobblestone...')
    const cobblestoneShortage = requiredCobblestone - cobblestoneCount

    try {
      const success = await collectBlock(
        mineflayer,
        'stone',
        cobblestoneShortage,
        maxDistance,
      )
      if (!success) {
        await moveAway(mineflayer, 30)
        continue
      }
    }
    catch (err) {
      if (err instanceof Error && err.message.includes('right tools')) {
        await ensurePickaxe(mineflayer)
        continue
      }
      else {
        logger.withError(err).error('Error collecting cobblestone')
        await moveAway(mineflayer, 30)
        continue
      }
    }

    cobblestoneCount = getItemCount(mineflayer, 'cobblestone')
  }

  logger.log('Bot: Collected enough cobblestone.')
  return true
}

export async function ensureCoal(mineflayer: Mineflayer, neededAmount: number, maxDistance: number = 4): Promise<boolean> {
  logger.log('Bot: Checking for coal...')
  let coalCount = getItemCount(mineflayer, 'coal')

  while (coalCount < neededAmount) {
    logger.log('Bot: Gathering more coal...')
    const coalShortage = neededAmount - coalCount

    try {
      await collectBlock(mineflayer, 'stone', coalShortage, maxDistance)
    }
    catch (err) {
      if (err instanceof Error && err.message.includes('right tools')) {
        await ensurePickaxe(mineflayer)
        continue
      }
      else {
        logger.withError(err).error('Error collecting cobblestone:')
        moveAway(mineflayer, 30)
        continue
      }
    }

    coalCount = getItemCount(mineflayer, 'cobblestone')
  }

  logger.log('Bot: Collected enough cobblestone.')
  return true
}

// Define the valid tool types as a union type
type ToolType = 'pickaxe' | 'sword' | 'axe' | 'shovel' | 'hoe'

// Define the valid materials as a union type
type MaterialType = 'diamond' | 'golden' | 'iron' | 'stone' | 'wooden'

// Constants for crafting tools
const TOOLS_MATERIALS: MaterialType[] = [
  'diamond',
  'golden',
  'iron',
  'stone',
  'wooden',
]

export function materialsForTool(tool: ToolType): number {
  switch (tool) {
    case 'pickaxe':
    case 'axe':
      return 3
    case 'sword':
    case 'hoe':
      return 2
    case 'shovel':
      return 1
    default:
      return 0
  }
}

// Helper function to ensure a specific tool, checking from best materials to wood
async function ensureTool(mineflayer: Mineflayer, toolType: ToolType, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} ${toolType}(s)...`)

  const neededMaterials = materialsForTool(toolType)

  // Check how many of the tool the bot currently has
  let toolCount = mineflayer.bot.inventory
    .items()
    .filter(item => item.name.includes(toolType))
    .length

  if (toolCount >= quantity) {
    logger.log(`Bot: Already has ${quantity} or more ${toolType}(s).`)
    return true
  }

  while (toolCount < quantity) {
    // Iterate over the tool materials from best (diamond) to worst (wooden)
    for (const material of TOOLS_MATERIALS) {
      const toolRecipe = `${material}_${toolType}` // Craft tool name like diamond_pickaxe, iron_sword
      const hasResources = await hasResourcesForTool(mineflayer, material, neededMaterials)

      // Check if we have enough material for the current tool
      if (hasResources) {
        await ensureCraftingTable(mineflayer)

        const sticksEnsured = await ensureSticks(mineflayer, 2)

        if (!sticksEnsured) {
          logger.error(
            `Bot: Failed to ensure planks or sticks for wooden ${toolType}.`,
          )
          continue
        }

        // Craft the tool
        const crafted = await craftRecipe(mineflayer, toolRecipe, 1)
        if (crafted) {
          toolCount++
          mineflayer.bot.chat(
            `I have crafted a ${material} ${toolType}. Total ${toolType}(s): ${toolCount}/${quantity}`,
          )
          logger.log(
            `Bot: ${material} ${toolType} crafted. Total ${toolCount}/${quantity}`,
          )
          if (toolCount >= quantity)
            return true
        }
        else {
          logger.error(`Bot: Failed to craft ${material} ${toolType}.`)
        }
      }
      else if (material === 'wooden') {
        // Crafting planks if we don't have enough resources for wooden tools
        logger.log(`Bot: Crafting planks for ${material} ${toolType}...`)
        await ensurePlanks(mineflayer, 4)
      }
    }
  }

  return toolCount >= quantity
}

// Helper function to check if the bot has enough materials to craft a tool of a specific material
export async function hasResourcesForTool(
  mineflayer: Mineflayer,
  material: MaterialType,
  num = 3, // Number of resources needed for most tools
): Promise<boolean> {
  switch (material) {
    case 'diamond':
      return getItemCount(mineflayer, 'diamond') >= num
    case 'golden':
      return getItemCount(mineflayer, 'gold_ingot') >= num
    case 'iron':
      return getItemCount(mineflayer, 'iron_ingot') >= num
    case 'stone':
      return getItemCount(mineflayer, 'cobblestone') >= num
    case 'wooden':
      return getItemCount(mineflayer, 'planks') >= num
    default:
      return false
  }
}

// Helper functions for specific tools:

// Ensure a pickaxe
export async function ensurePickaxe(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  return await ensureTool(mineflayer, 'pickaxe', quantity)
};

// Ensure a sword
export async function ensureSword(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  return await ensureTool(mineflayer, 'sword', quantity)
};

// Ensure an axe
export async function ensureAxe(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  return await ensureTool(mineflayer, 'axe', quantity)
};

// Ensure a shovel
export async function ensureShovel(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  return await ensureTool(mineflayer, 'shovel', quantity)
};

export async function ensureHoe(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  return await ensureTool(mineflayer, 'hoe', quantity)
};
