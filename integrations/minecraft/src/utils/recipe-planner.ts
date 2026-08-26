import type { Bot } from 'mineflayer'

import { getItemAnimalSource, getItemSmeltingIngredient, McData } from './mcdata'

export type RecipeStatus
  = | 'craftable' // Can craft right now with inventory
    | 'missing_resources' // Craftable but missing some ingredients
    | 'requires_smelting' // Needs furnace (can't auto-craft)
    | 'requires_gathering' // Must be mined/gathered (not craftable)
    | 'unknown_item' // Item doesn't exist

export interface RecipeStep {
  action: 'craft' | 'smelt' | 'gather' | 'hunt'
  item: string
  amount: number
  ingredients?: Record<string, number>
  requiresCraftingTable?: boolean
  source?: string // For gather/hunt: where to get it
}

export interface RecipePlan {
  targetItem: string
  targetAmount: number
  status: RecipeStatus
  steps: RecipeStep[]
  totalRequired: Record<string, number> // All base resources needed
  available: Record<string, number> // What we have
  missing: Record<string, number> // What we're missing
  canCraftNow: boolean // True if we can craft immediately
  requiresCraftingTable: boolean
}

export class RecipePlanner {
  private mcData: McData
  private bot: Bot
  private inventory: Record<string, number>

  constructor(bot: Bot) {
    this.bot = bot
    this.mcData = McData.fromBot(bot)
    this.inventory = this.getInventoryCounts()
  }

  private getInventoryCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const item of this.bot.inventory.items()) {
      counts[item.name] = (counts[item.name] || 0) + item.count
    }
    return counts
  }

  private getRecipeOutput(itemName: string): number {
    const itemId = this.mcData.getItemId(itemName)
    if (!itemId)
      return 1
    const recipes = this.mcData.registry.recipes[itemId]
    if (!recipes || recipes.length === 0)
      return 1
    // Get the result count from the first recipe
    const recipe = recipes[0] as any
    return recipe.result?.count ?? 1
  }

  private doesRecipeRequireCraftingTable(itemName: string): boolean {
    const itemId = this.mcData.getItemId(itemName)
    if (!itemId)
      return false
    const recipes = this.bot.recipesFor(itemId, null, 1, null)
    // If no recipes without table, it requires a table
    return recipes.length === 0
  }

  private selectBestRecipe(recipes: Record<string, number>[]): Record<string, number> | null {
    if (recipes.length === 0)
      return null
    if (recipes.length === 1)
      return recipes[0]

    // Heuristic: pick the recipe where we have the most ingredients available
    let bestRecipe = recipes[0]
    let bestScore = -1

    for (const recipe of recipes) {
      let score = 0
      for (const [ingredient, needed] of Object.entries(recipe)) {
        const have = this.inventory[ingredient] || 0
        score += Math.min(have, needed)
      }
      if (score > bestScore) {
        bestScore = score
        bestRecipe = recipe
      }
    }

    return bestRecipe
  }

  private getGatherSource(itemName: string): string | null {
    // Check block sources
    const blockSources = this.mcData.getItemBlockSources(itemName)
    if (blockSources.length > 0) {
      return `mine ${blockSources[0]}`
    }

    // Check animal sources
    const animalSource = getItemAnimalSource(itemName)
    if (animalSource) {
      return `hunt ${animalSource}`
    }

    return null
  }

  plan(itemName: string, amount: number): RecipePlan {
    const plan: RecipePlan = {
      targetItem: itemName,
      targetAmount: amount,
      status: 'unknown_item',
      steps: [],
      totalRequired: {},
      available: { ...this.inventory },
      missing: {},
      canCraftNow: false,
      requiresCraftingTable: false,
    }

    // Validate item exists
    const itemId = this.mcData.getItemId(itemName)
    if (!itemId) {
      plan.status = 'unknown_item'
      return plan
    }

    // Build the dependency tree
    const visited = new Set<string>()
    this.buildDependencyTree(itemName, amount, plan, visited)

    // Determine final status
    if (Object.keys(plan.missing).length === 0) {
      plan.status = 'craftable'
      plan.canCraftNow = true
    }
    else {
      // Check if any missing items require smelting or gathering
      const hasSmeltingStep = plan.steps.some(s => s.action === 'smelt')
      const hasGatherStep = plan.steps.some(s => s.action === 'gather' || s.action === 'hunt')

      if (hasSmeltingStep) {
        plan.status = 'requires_smelting'
      }
      else if (hasGatherStep) {
        plan.status = 'requires_gathering'
      }
      else {
        plan.status = 'missing_resources'
      }
    }

    // Check if crafting table is needed
    plan.requiresCraftingTable = plan.steps.some(s => s.action === 'craft' && s.requiresCraftingTable)

    return plan
  }

  private buildDependencyTree(
    itemName: string,
    amount: number,
    plan: RecipePlan,
    visited: Set<string>,
  ): void {
    // Prevent infinite recursion
    if (visited.has(itemName)) {
      return
    }
    visited.add(itemName)

    // Check if we already have enough
    const have = plan.available[itemName] || 0
    if (have >= amount) {
      plan.available[itemName] = have - amount
      return
    }

    const needed = amount - have
    if (have > 0) {
      plan.available[itemName] = 0
    }

    // Check for smelting recipe first
    const smeltIngredient = getItemSmeltingIngredient(itemName)
    if (smeltIngredient) {
      plan.steps.push({
        action: 'smelt',
        item: itemName,
        amount: needed,
        ingredients: { [smeltIngredient]: needed },
        source: `smelt ${smeltIngredient} in furnace`,
      })
      plan.totalRequired[smeltIngredient] = (plan.totalRequired[smeltIngredient] || 0) + needed

      // Recurse for the smelting ingredient
      this.buildDependencyTree(smeltIngredient, needed, plan, visited)
      return
    }

    // Check for crafting recipes
    const recipes = this.mcData.getItemCraftingRecipes(itemName)
    if (recipes && recipes.length > 0) {
      const recipe = this.selectBestRecipe(recipes)
      if (recipe) {
        const outputPerCraft = this.getRecipeOutput(itemName)
        const craftTimes = Math.ceil(needed / outputPerCraft)
        const requiresTable = this.doesRecipeRequireCraftingTable(itemName)

        // Scale ingredients by craft times
        const scaledIngredients: Record<string, number> = {}
        for (const [ingredient, perCraft] of Object.entries(recipe)) {
          scaledIngredients[ingredient] = perCraft * craftTimes
        }

        plan.steps.push({
          action: 'craft',
          item: itemName,
          amount: needed,
          ingredients: scaledIngredients,
          requiresCraftingTable: requiresTable,
        })

        // Add to total required and recurse
        for (const [ingredient, ingredientAmount] of Object.entries(scaledIngredients)) {
          plan.totalRequired[ingredient] = (plan.totalRequired[ingredient] || 0) + ingredientAmount
          this.buildDependencyTree(ingredient, ingredientAmount, plan, visited)
        }
        return
      }
    }

    // Not craftable - must be gathered
    const gatherSource = this.getGatherSource(itemName)
    const animalSource = getItemAnimalSource(itemName)

    plan.steps.push({
      action: animalSource ? 'hunt' : 'gather',
      item: itemName,
      amount: needed,
      source: gatherSource || 'unknown source',
    })

    plan.totalRequired[itemName] = (plan.totalRequired[itemName] || 0) + needed
    plan.missing[itemName] = (plan.missing[itemName] || 0) + needed
  }

  describe(plan: RecipePlan): string {
    const lines: string[] = []

    lines.push(`=== Recipe Plan: ${plan.targetAmount}x ${plan.targetItem} ===`)
    lines.push(`Status: ${this.formatStatus(plan.status)}`)
    lines.push('')

    if (plan.status === 'unknown_item') {
      lines.push(`The item "${plan.targetItem}" does not exist.`)
      return lines.join('\n')
    }

    // Show steps in reverse order (base materials first)
    const reversedSteps = [...plan.steps].reverse()

    if (reversedSteps.length > 0) {
      lines.push('Steps:')
      for (let i = 0; i < reversedSteps.length; i++) {
        const step = reversedSteps[i]
        lines.push(`${i + 1}. ${this.formatStep(step)}`)
      }
      lines.push('')
    }

    // Show what we have vs what we need
    if (Object.keys(plan.totalRequired).length > 0) {
      lines.push('Resources needed:')
      for (const [item, needed] of Object.entries(plan.totalRequired)) {
        const have = this.inventory[item] || 0
        const missing = plan.missing[item] || 0
        const status = missing > 0 ? `❌ missing ${missing}` : '✓ have enough'
        lines.push(`- ${item}: need ${needed}, have ${have} (${status})`)
      }
      lines.push('')
    }

    // Summary
    if (plan.canCraftNow) {
      const tableNote = plan.requiresCraftingTable ? ' (requires crafting table)' : ''
      lines.push(`✓ You can craft this now${tableNote}!`)
    }
    else if (Object.keys(plan.missing).length > 0) {
      lines.push('Missing resources:')
      for (const [item, amount] of Object.entries(plan.missing)) {
        const source = this.getGatherSource(item)
        lines.push(`- ${amount}x ${item}${source ? ` (${source})` : ''}`)
      }
    }

    return lines.join('\n')
  }

  private formatStatus(status: RecipeStatus): string {
    switch (status) {
      case 'craftable':
        return 'CRAFTABLE - Ready to craft!'
      case 'missing_resources':
        return 'MISSING RESOURCES - Need to gather more materials'
      case 'requires_smelting':
        return 'REQUIRES SMELTING - Need to use a furnace'
      case 'requires_gathering':
        return 'REQUIRES GATHERING - Need to mine/hunt for materials'
      case 'unknown_item':
        return 'UNKNOWN ITEM - Item does not exist'
    }
  }

  private formatStep(step: RecipeStep): string {
    switch (step.action) {
      case 'craft': {
        const ingredients = Object.entries(step.ingredients || {})
          .map(([item, count]) => `${count}x ${item}`)
          .join(' + ')
        const tableNote = step.requiresCraftingTable ? ' [needs crafting table]' : ''
        return `Craft ${step.amount}x ${step.item} from ${ingredients}${tableNote}`
      }
      case 'smelt':
        return `Smelt ${step.amount}x ${step.item} (${step.source})`
      case 'gather':
        return `Gather ${step.amount}x ${step.item} (${step.source})`
      case 'hunt':
        return `Hunt for ${step.amount}x ${step.item} (${step.source})`
    }
  }

  canCraftImmediately(): { canCraft: boolean, hasCraftingTable: boolean } {
    const craftingTable = this.bot.findBlock({
      matching: block => block.name === 'crafting_table',
      maxDistance: 4,
    })
    return {
      canCraft: true,
      hasCraftingTable: craftingTable !== null,
    }
  }
}

export function planRecipe(bot: Bot, itemName: string, amount: number): RecipePlan {
  const planner = new RecipePlanner(bot)
  return planner.plan(itemName, amount)
}

export function describeRecipePlan(bot: Bot, itemName: string, amount: number): string {
  const planner = new RecipePlanner(bot)
  const plan = planner.plan(itemName, amount)
  return planner.describe(plan)
}
