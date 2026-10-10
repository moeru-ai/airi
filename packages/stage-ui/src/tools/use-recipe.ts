import type { Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { isAutoRunRecipe, usableRecipes } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { array, description, literal, maxLength, minLength, object, optional, picklist, pipe, safeParse, strictObject, string, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { JUDGE_RECIPE_TOOL_NAME, parseJson } from './judge-recipe'

export const USE_RECIPE_TOOL_NAME = 'builtIn_useRecipe'

/**
 * What the tool returns. The chat renders it, and the model reads it as JSON.
 * - `loaded`: the recipe gave its steps to this conversation, which follows them now.
 * - `started`: a background recipe accepted the task and runs it in its own session.
 * - Other states: the recipe did not start, with the usable names so the model can correct itself.
 */
type UseRecipeResult
  = | { status: 'loaded', name: string, instructions: string }
    | { status: 'started', name: string, task: string }
    | { status: 'pending' | 'disabled' | 'unknown' | 'refused', name: string, usable: string[], reason?: string }

/** How the host starts a background recipe. Only the host makes the run exist. */
export type StartRecipe = (recipe: Recipe, task: string) => Promise<{ status: 'started' } | { status: 'refused', reason: string }>

const useRecipeParameters = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('The name of the recipe, as the recipe list shows it.')),
  task: pipe(string(), maxLength(1000), description('For a background recipe: what it should do now, in one or two sentences, with the facts it needs from this conversation. Empty otherwise.')),
})

const useRecipeResultSchema = union([
  object({ status: literal('loaded'), name: string(), instructions: string() }),
  object({ status: literal('started'), name: string(), task: string() }),
  object({ status: picklist(['pending', 'disabled', 'unknown', 'refused']), name: string(), usable: array(string()), reason: optional(string()) }),
])

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
  return recipe.instructions.trim().length > 0 && !isAutoRunRecipe(recipe)
}

/** A recipe name with the keywords that invoke it. */
function withKeywords(recipe: Recipe) {
  return `${recipe.name} (${recipe.keywords.join(', ')})`
}

/**
 * Lists the recipes for the run: the usable ones by name and purpose, auto-run, model-timed, and decision recipes, and proposals that wait.
 * Steps never appear here. A call loads them, so the list stays short and stable.
 * The list is the current state, so it overrides older tool results in history about approval.
 */
export function describeRecipesForRun(recipes: readonly Recipe[]) {
  const usable = usableRecipes(recipes)
  const startable = usable.filter(isStartable)
  const autoRun = usable.filter(recipe => isAutoRunRecipe(recipe) && !recipe.modelTimed)
  const timed = usable.filter(recipe => recipe.modelTimed)
  const decisions = usable.filter(recipe => recipe.decision)
  const pending = recipes.filter(recipe => !recipe.approved)
  const lines = [
    `Recipes are your skills. When one fits, call ${USE_RECIPE_TOOL_NAME} with its name. The call returns its steps. Follow them in this reply and in later replies while they fit.`,
    'A background recipe runs a task in its own space instead. Give it a short task, reply briefly, and never do its task yourself. Its result reaches you when it finishes.',
    'Never say that you used a recipe without the call. This list is the current state. It overrides earlier messages about approval.',
  ]
  lines.push(startable.length
    ? `Recipes you can use, enabled and approved by the owner:\n${startable.map(recipe => `- ${recipe.name}${recipe.background ? ' (background)' : ''}: ${recipe.description}`).join('\n')}`
    : 'You have no recipes to use now.')
  if (autoRun.length)
    lines.push(`These recipes start on their own when their trigger fires, for example after a silence: ${autoRun.map(recipe => recipe.name).join(', ')}.`)
  if (timed.length)
    lines.push(`These recipes run later at a time you set, after a keyword in the owner's message invokes them: ${timed.map(withKeywords).join(', ')}.`)
  if (decisions.length)
    lines.push(`These recipes are judgments. A keyword in the owner's message invokes them, and you answer them with ${JUDGE_RECIPE_TOOL_NAME}: ${decisions.map(withKeywords).join(', ')}.`)
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
export function resolveRecipeUse(recipes: readonly Recipe[], name: string): Recipe | Exclude<UseRecipeResult, { status: 'started' | 'loaded' }> {
  const recipe = findRecipe(recipes.filter(isStartable), name)
  const usable = usableRecipes(recipes).filter(isStartable).map(entry => entry.name)
  if (!recipe)
    return { status: 'unknown', name, usable }
  if (!recipe.approved)
    return { status: 'pending', name: recipe.name, usable }
  if (!recipe.enabled)
    return { status: 'disabled', name: recipe.name, usable }
  return recipe
}

/** Options for the recipe tool. */
interface CreateUseRecipeToolOptions {
  /** Reads all recipes at call time, so approval and switches apply at once. */
  recipes: () => readonly Recipe[]
  /** Starts a background recipe in its own session. */
  start: StartRecipe
}

/**
 * Creates the tool that uses a recipe, like a skill in an agent.
 * A recipe gives its steps to this conversation. A background recipe runs in its own session, so its steps and history stay there. The call shows in the chat.
 */
export async function createUseRecipeTool(options: CreateUseRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(useRecipeParameters)

  return [
    rawTool({
      name: USE_RECIPE_TOOL_NAME,
      // The recipe list is the tool's description, so only a run that holds the tool reads it.
      description: describeRecipesForRun(options.recipes()),
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(useRecipeParameters, rawInput)
        if (!parsed.success)
          return JSON.stringify({ status: 'unknown', name: '', usable: [] } satisfies UseRecipeResult)
        const recipes = options.recipes()
        const resolved = resolveRecipeUse(recipes, parsed.output.name)
        if ('status' in resolved)
          return JSON.stringify(resolved)
        if (!resolved.background)
          return JSON.stringify({ status: 'loaded', name: resolved.name, instructions: resolved.instructions.trim() } satisfies UseRecipeResult)
        const task = parsed.output.task.trim()
        const started = await options.start(resolved, task)
        const result: UseRecipeResult = started.status === 'refused'
          ? { status: 'refused', name: resolved.name, usable: [], reason: started.reason }
          : { status: 'started', name: resolved.name, task }
        return JSON.stringify(result)
      },
    }),
  ]
}
