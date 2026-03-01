import type { IndexedData, ShapedRecipe, ShapelessRecipe } from 'minecraft-data'
import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

/**
 * Registry-aware minecraft data helper.
 * Use this class when you have access to a bot to ensure item/block IDs match the server version.
 */
export class McData {
  public readonly registry: IndexedData

  constructor(registry: IndexedData) {
    this.registry = registry
  }

  static fromBot(bot: Bot): McData {
    return new McData(bot.registry)
  }

  getItemId(itemName: string): number {
    return this.registry.itemsByName[itemName]?.id ?? 0
  }

  getItemName(itemId: number): string {
    return this.registry.items[itemId]?.name ?? ''
  }

  getBlockId(blockName: string): number {
    return this.registry.blocksByName[blockName]?.id ?? 0
  }

  getBlockName(blockId: number): string {
    return this.registry.blocks[blockId]?.name ?? ''
  }

  getAllItems(ignore: string[] = []): any[] {
    return Object.values(this.registry.items).filter(item => !ignore.includes(item.name))
  }

  getAllItemIds(ignore: string[] = []): number[] {
    return this.getAllItems(ignore).map(item => item.id)
  }

  getAllBlocks(ignore: string[] = []): any[] {
    return Object.values(this.registry.blocks).filter(block => !ignore.includes(block.name))
  }

  getAllBlockIds(ignore: string[] = []): number[] {
    return this.getAllBlocks(ignore).map(block => block.id)
  }

  getClosestBlockName(input: string): string | null {
    const names = Object.keys(this.registry.blocksByName)
    let best: { name: string | null, distance: number } = { name: null, distance: Number.POSITIVE_INFINITY }

    for (const name of names) {
      const distance = levenshteinDistance(input, name)
      if (distance < best.distance) {
        best = { name, distance }
        if (distance === 0)
          break
      }
    }

    return best.name
  }

  getBlockTool(blockName: string): string | null {
    const block = this.registry.blocksByName[blockName]
    if (!block || !block.harvestTools) {
      return null
    }
    const toolIds = Object.keys(block.harvestTools).map(id => Number.parseInt(id))
    const toolName = this.getItemName(toolIds[0])
    return toolName || null
  }

  getItemCraftingRecipes(itemName: string): Record<string, number>[] | null {
    const itemId = this.getItemId(itemName)
    if (!itemId || !this.registry.recipes[itemId]) {
      return null
    }

    const recipes: Record<string, number>[] = []
    for (const r of this.registry.recipes[itemId]) {
      const recipe: Record<string, number> = {}
      let ingredients: number[] = []

      if (isShapelessRecipe(r)) {
        ingredients = r.ingredients.map((ing: any) => ing.id)
      }
      else if (isShapedRecipe(r)) {
        ingredients = r.inShape
          .flat()
          .map((ing: any) => ing?.id)
          .filter(Boolean)
      }

      for (const ingredientId of ingredients) {
        const ingredientName = this.getItemName(ingredientId)
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

  getItemBlockSources(itemName: string): string[] {
    const itemId = this.getItemId(itemName)
    const sources: string[] = []
    if (!itemId)
      return sources
    for (const block of this.getAllBlocks()) {
      if (block.drops && block.drops.includes(itemId)) {
        sources.push(block.name)
      }
    }
    return sources
  }
}

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

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0))

  for (let i = 0; i <= a.length; i++)
    matrix[i][0] = i
  for (let j = 0; j <= b.length; j++)
    matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

// Type guards
function isShapelessRecipe(recipe: unknown): recipe is ShapelessRecipe {
  return 'ingredients' in (recipe as object)
}

function isShapedRecipe(recipe: unknown): recipe is ShapedRecipe {
  return 'inShape' in (recipe as object)
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
