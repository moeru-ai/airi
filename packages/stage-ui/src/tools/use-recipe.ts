import type { Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { isAutoRunRecipe } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { array, description, literal, maxLength, minLength, object, optional, picklist, pipe, safeParse, strictObject, string, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

export const USE_RECIPE_TOOL_NAME = 'builtIn_useRecipe'

/**
 * What the tool returns. The chat renders it, and the model reads it as JSON.
 * - `started`: the scheduler admitted the task, and the recipe runs it in its own session.
 * - `switched`: a handover recipe took over the conversation.
 * - Other states: the recipe did not start, with the usable names so the model can correct itself.
 */
export type UseRecipeResult
  = | { status: 'started', name: string, task: string }
    | { status: 'switched', name: string }
    | { status: 'pending' | 'disabled' | 'unknown' | 'refused', name: string, usable: string[], reason?: string }

/** How the host starts a recipe. Only the scheduler makes the run exist. */
export type StartRecipe = (recipe: Recipe, task: string) => Promise<{ status: 'started' | 'switched' } | { status: 'refused', reason: string }>

const useRecipeParameters = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('The name of the recipe, as the recipe list shows it.')),
  task: pipe(string(), maxLength(1000), description('What the recipe should do now, in one or two sentences, with the facts it needs from this conversation.')),
})

const useRecipeResultSchema = union([
  object({ status: literal('started'), name: string(), task: string() }),
  object({ status: literal('switched'), name: string() }),
  object({ status: picklist(['pending', 'disabled', 'unknown', 'refused']), name: string(), usable: array(string()), reason: optional(string()) }),
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
 * Reads a recorded call for the chat: the recipe name and task from the arguments, and the outcome from the result.
 * A call that is still running, or a result in another shape, has no outcome.
 */
export function readRecipeUse(args: string, result: unknown): { name: string, task: string, outcome?: UseRecipeResult } {
  const input = safeParse(useRecipeParameters, parseJson(args))
  const outcome = safeParse(useRecipeResultSchema, parseJson(result))
  return {
    name: outcome.success ? outcome.output.name : input.success ? input.output.name : '',
    task: input.success ? input.output.task : '',
    outcome: outcome.success ? outcome.output : undefined,
  }
}

/** Instruction recipes with steps that a conversation can start. Auto-run recipes start on their triggers instead. */
function isStartable(recipe: Recipe) {
  return recipe.style.kind === 'instructions' && recipe.style.instructions.trim().length > 0 && !isAutoRunRecipe(recipe)
}

function isUsable(recipe: Recipe) {
  return recipe.enabled && recipe.approved
}

/**
 * Lists the recipes for the run: the startable ones by name and purpose, decision recipes that run by themselves, auto-run recipes, and proposals that wait.
 * Steps never appear here. Each recipe runs in its own space, so this conversation keeps its own prefix.
 * The list is the current state, so it overrides older tool results in history about approval.
 */
export function describeRecipesForRun(recipes: readonly Recipe[]) {
  const startable = recipes.filter(recipe => isUsable(recipe) && isStartable(recipe))
  const decisions = recipes.filter(recipe => isUsable(recipe) && recipe.style.kind === 'decision')
  const autoRun = recipes.filter(recipe => isUsable(recipe) && isAutoRunRecipe(recipe))
  const pending = recipes.filter(recipe => !recipe.approved)
  const lines = [
    `Recipes are your skills. Each one runs in its own space, not in this conversation. To start one, call ${USE_RECIPE_TOOL_NAME} with its name and a short task.`,
    'A task recipe answers later. Reply briefly now, for example that you started it, and never do its task yourself. Its result reaches you when it finishes.',
    'A recipe marked as a handover takes over the conversation, and you write nothing more in this reply.',
    'Never say that you used a recipe without the call. This list is the current state. It overrides earlier messages about approval.',
  ]
  lines.push(startable.length
    ? `Recipes you can start, enabled and approved by the owner:\n${startable.map(recipe => `- ${recipe.name}${recipe.handover ? ' (handover)' : ''}: ${recipe.description}`).join('\n')}`
    : 'You have no recipes to start now.')
  if (decisions.length)
    lines.push(`These recipes run by themselves before you reply: ${decisions.map(recipe => recipe.name).join(', ')}.`)
  if (autoRun.length)
    lines.push(`These recipes start on their own when their trigger fires, for example after a silence: ${autoRun.map(recipe => recipe.name).join(', ')}.`)
  if (pending.length)
    lines.push(`Proposals that wait for the owner's approval, so you cannot start them yet: ${pending.map(recipe => recipe.name).join(', ')}.`)
  return lines.join('\n')
}

/** Finds a recipe by its name or id. Names ignore letter case and outer spaces. */
function findRecipe(recipes: readonly Recipe[], name: string) {
  const wanted = name.trim().toLowerCase()
  return recipes.find(recipe => recipe.id === name.trim() || recipe.name.trim().toLowerCase() === wanted)
}

/** Finds the recipe that a call names, or the reason it cannot start. */
export function resolveRecipeUse(recipes: readonly Recipe[], name: string): Recipe | Exclude<UseRecipeResult, { status: 'started' | 'switched' }> {
  const recipe = findRecipe(recipes.filter(isStartable), name)
  const usable = recipes.filter(entry => isUsable(entry) && isStartable(entry)).map(entry => entry.name)
  if (!recipe)
    return { status: 'unknown', name, usable }
  if (!recipe.approved)
    return { status: 'pending', name: recipe.name, usable }
  if (!recipe.enabled)
    return { status: 'disabled', name: recipe.name, usable }
  return recipe
}

/** Options for the recipe tool. */
export interface CreateUseRecipeToolOptions {
  /** Reads all recipes at call time, so approval and switches apply at once. */
  recipes: () => readonly Recipe[]
  /** Proposes the recipe to the scheduler. */
  start: StartRecipe
}

/**
 * Creates the tool that hands a task to a recipe.
 * The recipe runs in its own session, so its steps and history never enter this conversation. The call shows in the chat.
 */
export async function createUseRecipeTool(options: CreateUseRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(useRecipeParameters)

  return [
    rawTool({
      name: USE_RECIPE_TOOL_NAME,
      description: 'Start one of your recipes with a short task. It runs in its own space, and its result reaches you later.',
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(useRecipeParameters, rawInput)
        if (!parsed.success)
          return JSON.stringify({ status: 'unknown', name: '', usable: [] } satisfies UseRecipeResult)
        const recipes = options.recipes()
        const resolved = resolveRecipeUse(recipes, parsed.output.name)
        if ('status' in resolved)
          return JSON.stringify(resolved)
        const task = parsed.output.task.trim()
        const started = await options.start(resolved, task)
        const result: UseRecipeResult = started.status === 'refused'
          ? { status: 'refused', name: resolved.name, usable: [], reason: started.reason }
          : started.status === 'switched' ? { status: 'switched', name: resolved.name } : { status: 'started', name: resolved.name, task }
        return JSON.stringify(result)
      },
    }),
  ]
}
