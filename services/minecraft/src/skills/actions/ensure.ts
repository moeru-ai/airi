import type { Mineflayer } from '../../libs/mineflayer'

import { ActionError } from '../../utils/errors'
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

  const hasCraftingTable = getItemCount(mineflayer, 'crafting_table') > 0

  if (hasCraftingTable) {
    logger.log('Bot: Crafting table is available.')
    return true
  }

  // Check if we already have wood to make it
  try {
    const planksEnsured = await ensurePlanks(mineflayer, 4)
    if (!planksEnsured) {
      throw new ActionError('RESOURCE_MISSING', 'Failed to ensure planks for crafting table', { item: 'planks', count: 4 })
    }

    // Craft crafting table
    const result = await craftRecipe(mineflayer, 'crafting_table', 1)
    if (result) {
      mineflayer.bot.chat('I have made a crafting table.')
      logger.log('Bot: Crafting table crafted.')
      return true
    }
  }
  catch (error) {
    if (error instanceof ActionError) {
      throw error
    }
    // If craftRecipe failed but didn't throw ActionError (protection for mixed versions)
    throw new ActionError('CRAFTING_FAILED', 'Failed to craft crafting table', { error })
  }

  throw new ActionError('CRAFTING_FAILED', 'Failed to ensure crafting table')
}

// Helper function to ensure a specific amount of planks
export async function ensurePlanks(mineflayer: Mineflayer, neededAmount: number): Promise<boolean> {
  logger.log('Bot: Checking for planks...')

  let planksCount = getItemCount(mineflayer, 'planks')

  if (neededAmount <= planksCount) {
    logger.log('Bot: Have enough planks.')
    return true
  }

  const maxRetries = 3
  let retries = 0

  while (neededAmount > planksCount && retries < maxRetries) {
    retries++
    const logsNeeded = Math.ceil((neededAmount - planksCount) / PLANKS_PER_LOG)

    // Get all available log types in inventory
    const availableLogs = mineflayer.bot.inventory
      .items()
      .filter(item => item.name.includes('log'))

    // If no logs available, gather more wood
    if (availableLogs.length === 0) {
      logger.log(`Bot: Not enough logs. Gathering ${logsNeeded} logs.`)
      try {
        await gatherWood(mineflayer, logsNeeded, 80)
      }
      catch (error) {
        throw new ActionError('RESOURCE_MISSING', 'Could not gather wood', { item: 'log', count: logsNeeded, originalError: error })
      }

      // Check if we actually got wood
      const newLogs = mineflayer.bot.inventory.items().filter(item => item.name.includes('log'))
      if (newLogs.length === 0) {
        throw new ActionError('RESOURCE_MISSING', 'Gathered wood but inventory still empty of logs', { item: 'log' })
      }
      // Continue to next iteration to craft
      continue
    }

    // Iterate over each log type to craft planks
    let anyCrafted = false
    for (const log of availableLogs) {
      const logType = log.name.replace('_log', '') // Get log type without "_log" suffix
      const logsToCraft = Math.min(log.count, logsNeeded)

      logger.log(`Trying to make ${logsToCraft * PLANKS_PER_LOG} ${logType}_planks`)

      const crafted = await craftRecipe(
        mineflayer,
        `${logType}_planks`,
        logsToCraft * PLANKS_PER_LOG,
      )

      if (crafted) {
        planksCount = getItemCount(mineflayer, 'planks')
        mineflayer.bot.chat(`I have crafted ${logsToCraft * PLANKS_PER_LOG} ${logType} planks.`)
        anyCrafted = true
      }
      else {
        // If we have logs but failed to craft planks, it might be due to full inventory or other issues
        logger.error(`Bot: Failed to craft ${logType} planks.`)
      }

      // Check if we have enough planks after crafting
      if (planksCount >= neededAmount)
        break
    }

    if (!anyCrafted && availableLogs.length > 0) {
      // We had logs but couldn't craft anything? That's a problem.
      throw new ActionError('CRAFTING_FAILED', 'Has logs but failed to craft planks', { availableLogs: availableLogs.map(l => l.name) })
    }
  }

  if (planksCount >= neededAmount) {
    return true
  }

  throw new ActionError('RESOURCE_MISSING', 'Failed to ensure enough planks after retries', { needed: neededAmount, current: planksCount })
}

// Helper function to ensure a specific amount of sticks
export async function ensureSticks(mineflayer: Mineflayer, neededAmount: number): Promise<boolean> {
  logger.log('Bot: Checking for sticks...')

  let sticksCount = getItemCount(mineflayer, 'stick')

  if (neededAmount <= sticksCount) {
    logger.log('Bot: Have enough sticks.')
    return true
  }

  const maxRetries = 2
  let retries = 0

  while (neededAmount > sticksCount && retries < maxRetries) {
    retries++
    const planksCount = getItemCount(mineflayer, 'planks')
    const planksNeeded = Math.max(
      Math.ceil((neededAmount - sticksCount) / STICKS_PER_PLANK),
      2, // Minimum craft is usually 2 planks -> 4 sticks
    )

    if (planksCount >= planksNeeded) {
      try {
        const sticksId = getItemId('stick')
        const recipe = mineflayer.bot.recipesFor(sticksId, null, 1, null)[0]
        if (!recipe) {
          throw new ActionError('CRAFTING_FAILED', 'No recipe for sticks found')
        }
        await mineflayer.bot.craft(recipe, Math.ceil((neededAmount - sticksCount) / 4)) // Crafting usually gives 4 sticks
        sticksCount = getItemCount(mineflayer, 'stick')
        mineflayer.bot.chat(`I have made sticks.`)
      }
      catch (err) {
        logger.withError(err).error('Bot: Failed to craft sticks.')
        throw new ActionError('CRAFTING_FAILED', 'Failed to craft sticks', { error: err })
      }
    }
    else {
      await ensurePlanks(mineflayer, planksNeeded)
    }
    sticksCount = getItemCount(mineflayer, 'stick')
  }

  if (sticksCount >= neededAmount)
    return true

  throw new ActionError('RESOURCE_MISSING', 'Failed to ensure sticks', { needed: neededAmount, current: sticksCount })
}

// Ensure a specific number of chests
export async function ensureChests(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} chest(s)...`)

  const chestCount = getItemCount(mineflayer, 'chest')

  if (chestCount >= quantity) {
    return true
  }

  await ensurePlanks(mineflayer, 8 * (quantity - chestCount))
  const crafted = await craftRecipe(mineflayer, 'chest', quantity - chestCount)

  if (!crafted) {
    throw new ActionError('CRAFTING_FAILED', 'Failed to craft chests')
  }

  return true
}

// Ensure a specific number of furnaces
export async function ensureFurnaces(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} furnace(s)...`)

  const furnaceCount = getItemCount(mineflayer, 'furnace')

  if (furnaceCount >= quantity) {
    return true
  }

  const stoneNeeded = 8 * (quantity - furnaceCount)
  try {
    await ensureCobblestone(mineflayer, stoneNeeded)
  }
  catch (e) {
    throw new ActionError('RESOURCE_MISSING', 'Failed to gather cobblestone for furnace', { error: e })
  }

  const crafted = await craftRecipe(mineflayer, 'furnace', quantity - furnaceCount)
  if (!crafted) {
    throw new ActionError('CRAFTING_FAILED', 'Failed to craft furnace')
  }

  return true
}

// Ensure a specific number of torches
export async function ensureTorches(mineflayer: Mineflayer, quantity: number = 1): Promise<boolean> {
  logger.log(`Bot: Checking for ${quantity} torch(es)...`)

  const torchCount = getItemCount(mineflayer, 'torch')

  if (torchCount >= quantity) {
    return true
  }

  const needed = quantity - torchCount
  await ensureSticks(mineflayer, Math.ceil(needed / 4))

  try {
    await ensureCoal(mineflayer, Math.ceil(needed / 4))
  }
  catch (e) {
    throw new ActionError('RESOURCE_MISSING', 'Failed to gather coal for torches', { error: e })
  }

  const crafted = await craftRecipe(mineflayer, 'torch', Math.ceil(needed / 4))
  if (!crafted) {
    throw new ActionError('CRAFTING_FAILED', 'Failed to craft torches')
  }
  return true
}

// Ensure a campfire
// Todo: rework
export async function ensureCampfire(mineflayer: Mineflayer): Promise<boolean> {
  logger.log('Bot: Checking for a campfire...')

  const hasCampfire = getItemCount(mineflayer, 'campfire') > 0
  if (hasCampfire)
    return true

  await ensurePlanks(mineflayer, 3)
  await ensureSticks(mineflayer, 3)
  try {
    await ensureCoal(mineflayer, 1)
  }
  catch (e) {
    throw new ActionError('RESOURCE_MISSING', 'Failed to gather coal/charcoal for campfire', { error: e })
  }

  const crafted = await craftRecipe(mineflayer, 'campfire', 1)
  if (!crafted) {
    throw new ActionError('CRAFTING_FAILED', 'Failed to craft campfire')
  }

  return true
}

// Helper function to gather cobblestone
export async function ensureCobblestone(mineflayer: Mineflayer, requiredCobblestone: number, maxDistance: number = 4): Promise<boolean> {
  let cobblestoneCount = getItemCount(mineflayer, 'cobblestone')
  let retries = 0
  const maxRetries = 3

  while (cobblestoneCount < requiredCobblestone && retries < maxRetries) {
    retries++
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
        await moveAway(mineflayer, 10)
        continue
      }
    }
    catch (err: unknown) {
      if (err instanceof Error && err.message.includes('right tools')) {
        await ensurePickaxe(mineflayer)
        continue
      }
      else {
        throw new ActionError('RESOURCE_MISSING', 'Error collecting cobblestone', { error: err })
      }
    }

    cobblestoneCount = getItemCount(mineflayer, 'cobblestone')
  }

  if (cobblestoneCount >= requiredCobblestone)
    return true

  throw new ActionError('RESOURCE_MISSING', 'Could not gather enough cobblestone', { required: requiredCobblestone, current: cobblestoneCount })
}

export async function ensureCoal(mineflayer: Mineflayer, neededAmount: number, maxDistance: number = 4): Promise<boolean> {
  logger.log('Bot: Checking for coal...')
  let coalCount = getItemCount(mineflayer, 'coal')
  let retries = 0
  const maxRetries = 3

  while (coalCount < neededAmount && retries < maxRetries) {
    retries++
    logger.log('Bot: Gathering more coal...')
    const coalShortage = neededAmount - coalCount

    try {
      await collectBlock(mineflayer, 'coal_ore', coalShortage, maxDistance)
    }
    catch (err: unknown) {
      if (err instanceof Error && err.message.includes('right tools')) {
        await ensurePickaxe(mineflayer)
        continue
      }
      else {
        throw new ActionError('RESOURCE_MISSING', 'Error collecting coal', { error: err })
      }
    }

    coalCount = getItemCount(mineflayer, 'coal')
  }

  if (coalCount >= neededAmount)
    return true
  throw new ActionError('RESOURCE_MISSING', 'Could not gather enough coal', { required: neededAmount, current: coalCount })
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

  let toolCount = mineflayer.bot.inventory
    .items()
    .filter(item => item.name.includes(toolType))
    .length

  if (toolCount >= quantity) {
    return true
  }

  // Iterate over the tool materials from best (diamond) to worst (wooden)
  for (const material of TOOLS_MATERIALS) {
    const toolRecipe = `${material}_${toolType}`
    const neededMaterials = materialsForTool(toolType)
    const hasResources = await hasResourcesForTool(mineflayer, material, neededMaterials)

    if (hasResources) {
      try {
        await ensureCraftingTable(mineflayer)
        await ensureSticks(mineflayer, 2)

        const crafted = await craftRecipe(mineflayer, toolRecipe, 1)
        if (crafted) {
          toolCount++
          mineflayer.bot.chat(`I have crafted a ${material} ${toolType}.`)
          if (toolCount >= quantity)
            return true
        }
      }
      catch (err) {
        if (err instanceof ActionError && err.code === 'RESOURCE_MISSING') {
          // Just fall through to next material if resources missing
        }
        else {
          logger.error(`Failed to craft ${material} ${toolType}, trying next material.`)
        }
      }
    }
    else if (material === 'wooden') {
      // Last resort: make wooden tools
      // This will try to gather wood if needed, or throw if it fails
      try {
        await ensurePlanks(mineflayer, 4)
        await ensureCraftingTable(mineflayer)
        await ensureSticks(mineflayer, 2)
        const crafted = await craftRecipe(mineflayer, `wooden_${toolType}`, 1)
        if (crafted)
          return true
      }
      catch (err) {
        throw new ActionError('CRAFTING_FAILED', `Could not craft any ${toolType}`, { error: err })
      }
    }
  }

  throw new ActionError('CRAFTING_FAILED', `Failed to ensure ${toolType} of any material`)
}

// Helper function to check if the bot has enough materials to craft a tool of a specific material
export async function hasResourcesForTool(
  mineflayer: Mineflayer,
  material: MaterialType,
  num = 3,
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
