import type { Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { isAutoRunRecipe } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { array, description, literal, maxLength, minLength, object, picklist, pipe, safeParse, strictObject, string, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const USE_RECIPE_TOOL_NAME = 'builtIn_useRecipe'

/** What the tool returns. The chat renders it, and the model reads it as JSON. */
export type UseRecipeResult
  = | { status: 'used', name: string, steps: string }
    | { status: 'pending' | 'disabled' | 'unknown', name: string, usable: string[] }

const useRecipeParameters = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('The name of the recipe to use, as the recipe list shows it.')),
})

const useRecipeResultSchema = union([
  object({ status: literal('used'), name: string(), steps: string() }),
  object({ status: picklist(['pending', 'disabled', 'unknown']), name: string(), usable: array(string()) }),
])

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return undefined
  }
}

/**
 * Reads a recorded call for the chat: the recipe name from the arguments and the outcome from the result.
 * A call that is still running, or a result in another shape, has no outcome.
 */
export function readRecipeUse(args: string, result: unknown): { name: string, outcome?: UseRecipeResult } {
  const input = safeParse(useRecipeParameters, parseJson(args))
  const outcome = safeParse(useRecipeResultSchema, parseJson(result))
  return {
    name: outcome.success ? outcome.output.name : input.success ? input.output.name : '',
    outcome: outcome.success ? outcome.output : undefined,
  }
}

/** Instruction recipes with steps that a conversation loads. Auto-run recipes and other styles run without this tool. */
function hasSteps(recipe: Recipe) {
  return recipe.style.kind === 'instructions' && recipe.style.instructions.trim().length > 0 && !isAutoRunRecipe(recipe)
}

function isUsable(recipe: Recipe) {
  return recipe.enabled && recipe.approved
}

/**
 * Lists the recipes for the run: the usable ones by name and purpose, decision recipes that run by themselves, and proposals that wait.
 * The list is the current state, so it overrides older tool results in history about approval.
 */
export function describeRecipesForRun(recipes: readonly Recipe[]) {
  const usable = recipes.filter(recipe => isUsable(recipe) && hasSteps(recipe))
  const decisions = recipes.filter(recipe => isUsable(recipe) && recipe.style.kind === 'decision')
  const autoRun = recipes.filter(recipe => isUsable(recipe) && isAutoRunRecipe(recipe))
  const pending = recipes.filter(recipe => !recipe.approved)
  const lines = [
    `Recipes are your skills. To use one, call ${USE_RECIPE_TOOL_NAME} with its name before you reply. The result gives its steps, and the owner sees that you used it.`,
    'Never say that you use a recipe without this call. A recipe stays in use in this conversation until its steps end it or the owner asks you to stop.',
    'This list is the current state. It overrides earlier messages about approval.',
  ]
  lines.push(usable.length
    ? `Usable recipes, enabled and approved by the owner:\n${usable.map(recipe => `- ${recipe.name}: ${recipe.description}`).join('\n')}`
    : 'You have no usable recipes now.')
  if (decisions.length)
    lines.push(`These recipes run by themselves before you reply: ${decisions.map(recipe => recipe.name).join(', ')}.`)
  if (autoRun.length)
    lines.push(`These recipes start on their own when their trigger fires, for example after a silence: ${autoRun.map(recipe => recipe.name).join(', ')}.`)
  if (pending.length)
    lines.push(`Proposals that wait for the owner's approval, so you cannot use them yet: ${pending.map(recipe => recipe.name).join(', ')}.`)
  return lines.join('\n')
}

/** Finds a recipe by its name or id. Names ignore letter case and outer spaces. */
function findRecipe(recipes: readonly Recipe[], name: string) {
  const wanted = name.trim().toLowerCase()
  return recipes.find(recipe => recipe.id === name.trim() || recipe.name.trim().toLowerCase() === wanted)
}

/** Resolves one tool call against the current recipes. */
export function resolveRecipeUse(recipes: readonly Recipe[], name: string): UseRecipeResult {
  const recipe = findRecipe(recipes.filter(hasSteps), name)
  const usable = recipes.filter(entry => isUsable(entry) && hasSteps(entry)).map(entry => entry.name)
  if (!recipe)
    return { status: 'unknown', name, usable }
  if (!recipe.approved)
    return { status: 'pending', name: recipe.name, usable }
  if (!recipe.enabled)
    return { status: 'disabled', name: recipe.name, usable }
  return { status: 'used', name: recipe.name, steps: recipe.style.kind === 'instructions' ? recipe.style.instructions.trim() : '' }
}

/** Options for the recipe use tool. */
export interface CreateUseRecipeToolOptions {
  /** Reads all recipes at call time, so approval and switches apply at once. */
  recipes: () => readonly Recipe[]
}

/**
 * Creates the tool that loads a recipe's steps into the run.
 * The call makes recipe use visible in the chat, and the result tells the model whether the recipe can run.
 */
export async function createUseRecipeTool(options: CreateUseRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(useRecipeParameters)

  return [
    rawTool({
      name: USE_RECIPE_TOOL_NAME,
      description: 'Use one of your recipes. Returns its steps when the owner enabled and approved it.',
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(useRecipeParameters, rawInput)
        if (!parsed.success)
          return JSON.stringify({ status: 'unknown', name: '', usable: [] } satisfies UseRecipeResult)
        return JSON.stringify(resolveRecipeUse(options.recipes(), parsed.output.name))
      },
    }),
  ]
}
