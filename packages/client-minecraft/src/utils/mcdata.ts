import type { Biome, ShapedRecipe, ShapelessRecipe } from 'minecraft-data'
import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

import minecraftData from 'minecraft-data'
import prismarineItem from 'prismarine-item'

const GAME_VERSION = '1.20'

export const gameData = minecraftData(GAME_VERSION)
export const Item = prismarineItem(GAME_VERSION)

export const WOOD_TYPES: string[] = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
]

export const MATCHING_WOOD_BLOCKS: string[] = [
  'log',
  'planks',
  'sign',
  'boat',
  'fence_gate',
  'door',
  'fence',
  'slab',
  'stairs',
  'button',
  'pressure_plate',
  'trapdoor',
]

export const WOOL_COLORS: string[] = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
]

export function isHuntable(mob: Entity): boolean {
  if (!mob || !mob.name)
    return false
  const animals: string[] = [
    'chicken',
    'cow',
    'llama',
    'mooshroom',
    'pig',
    'rabbit',
    'sheep',
  ]
  return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16] // metadata[16] indicates baby status
}

export function isHostile(mob: Entity): boolean {
  if (!mob || !mob.name)
    return false
  return (
    (mob.type === 'mob' || mob.type === 'hostile')
    && mob.name !== 'iron_golem'
    && mob.name !== 'snow_golem'
  )
}

export function getItemId(itemName: string): number {
  const item = gameData.itemsByName[itemName]

  return item?.id || 0
}

export function getItemName(itemId: number): string {
  const item = gameData.items[itemId]
  return item.name || ''
}

export function getBlockId(blockName: string): number {
  const block = gameData.blocksByName?.[blockName]
  return block?.id || 0
}

export function getBlockName(blockId: number): string {
  const block = gameData.blocks[blockId]
  return block.name || ''
}

export function getAllItems(ignore: string[] = []): any[] {
  const items: any[] = []
  for (const itemId in gameData.items) {
    const item = gameData.items[itemId]
    if (!ignore.includes(item.name)) {
      items.push(item)
    }
  }
  return items
}

export function getAllItemIds(ignore: string[] = []): number[] {
  const items = getAllItems(ignore)
  const itemIds: number[] = []
  for (const item of items) {
    itemIds.push(item.id)
  }
  return itemIds
}

export function getAllBlocks(ignore: string[] = []): any[] {
  const blocks: any[] = []
  for (const blockId in gameData.blocks) {
    const block = gameData.blocks[blockId]
    if (!ignore.includes(block.name)) {
      blocks.push(block)
    }
  }
  return blocks
}

export function getAllBlockIds(ignore: string[] = []): number[] {
  const blocks = getAllBlocks(ignore)
  const blockIds: number[] = []
  for (const block of blocks) {
    blockIds.push(block.id)
  }
  return blockIds
}

export function getAllBiomes(): Record<number, Biome> {
  return gameData.biomes
}

export function getItemCraftingRecipes(itemName: string): any[] | null {
  const itemId = getItemId(itemName)
  if (!itemId || !gameData.recipes[itemId]) {
    return null
  }

  const recipes: Record<string, number>[] = []
  for (const r of gameData.recipes[itemId]) {
    const recipe: Record<string, number> = {}
    let ingredients: number[] = []

    if (isShapelessRecipe(r)) {
      // Handle shapeless recipe
      ingredients = r.ingredients.map((ing: any) => ing.id)
    }
    else if (isShapedRecipe(r)) {
      // Handle shaped recipe
      ingredients = r.inShape
        .flat()
        .map((ing: any) => ing?.id)
        .filter(Boolean)
    }

    for (const ingredientId of ingredients) {
      const ingredientName = getItemName(ingredientId)
      if (ingredientName === null)
        continue
      if (!recipe[ingredientName])
        recipe[ingredientName] = 0
      recipe[ingredientName]++
    }

    recipes.push(recipe)
  }

  return recipes
}

// Type guards
function isShapelessRecipe(recipe: any): recipe is ShapelessRecipe {
  return 'ingredients' in recipe
}

function isShapedRecipe(recipe: any): recipe is ShapedRecipe {
  return 'inShape' in recipe
}

export function getItemSmeltingIngredient(
  itemName: string,
): string | undefined {
  return {
    baked_potato: 'potato',
    steak: 'raw_beef',
    cooked_chicken: 'raw_chicken',
    cooked_cod: 'raw_cod',
    cooked_mutton: 'raw_mutton',
    cooked_porkchop: 'raw_porkchop',
    cooked_rabbit: 'raw_rabbit',
    cooked_salmon: 'raw_salmon',
    dried_kelp: 'kelp',
    iron_ingot: 'raw_iron',
    gold_ingot: 'raw_gold',
    copper_ingot: 'raw_copper',
    glass: 'sand',
  }[itemName]
}

export function getItemBlockSources(itemName: string): string[] {
  const itemId = getItemId(itemName)
  const sources: string[] = []
  if (!itemId)
    return sources
  for (const block of getAllBlocks()) {
    if (block.drops && block.drops.includes(itemId)) {
      sources.push(block.name)
    }
  }
  return sources
}

export function getItemAnimalSource(itemName: string): string | undefined {
  return {
    raw_beef: 'cow',
    raw_chicken: 'chicken',
    raw_cod: 'cod',
    raw_mutton: 'sheep',
    raw_porkchop: 'pig',
    raw_rabbit: 'rabbit',
    raw_salmon: 'salmon',
    leather: 'cow',
    wool: 'sheep',
  }[itemName]
}

export function getBlockTool(blockName: string): string | null {
  const block = gameData.blocksByName[blockName]
  if (!block || !block.harvestTools) {
    return null
  }
  const toolIds = Object.keys(block.harvestTools).map(id => Number.parseInt(id))
  const toolName = getItemName(toolIds[0])
  return toolName || null // Assuming the first tool is the simplest
}

export function makeItem(name: string, amount = 1): InstanceType<typeof Item> {
  const itemId = getItemId(name)
  if (itemId === null)
    throw new Error(`Item ${name} not found.`)
  return new Item(itemId, amount)
}

// Function to get the nearest block of a specific type using Mineflayer
export function getNearestBlock(
  bot: Bot,
  blockType: string,
  maxDistance: number,
) {
  const blocks = bot.findBlocks({
    matching: block => block.name === blockType,
    maxDistance,
    count: 1,
  })

  if (blocks.length === 0)
    return null

  const nearestBlockPosition = blocks[0]
  return bot.blockAt(nearestBlockPosition)
}
