import type { ClassifierAnswer, ClassifierQuestion, ClassifierRequest } from './classifier'
import type { MoodDimension } from './mood'

import { noulConfidence } from './classifier'

/**
 * How a recipe works. A recipe is one way to handle a kind of task, and its style says how it runs.
 *
 * - `instructions`: guidance and tools that the conversation run uses when it judges them fitting.
 * - `decision`: one classifier question of any type. Each answer has its own action, applied before generation.
 * - `run`: a child run that the scheduler starts with its own envelope.
 * - `mcp`: one call to a configured MCP tool.
 */
export type RecipeStyle
  = | { kind: 'instructions', instructions: string, tools?: string[] }
    | { kind: 'decision', question: ClassifierQuestion, actions: Record<string, DecisionAction> }
    | { kind: 'run', instructions: string, tools?: string[] }
    | { kind: 'mcp', server: string, tool: string }

/**
 * What one answer of a decision recipe does to the run.
 * - `reply`: nothing changes.
 * - `stay-quiet`: the run reads the message and does not reply.
 * - `hint`: a sentence joins this run's context. It informs the reply and never instructs it.
 * - `recipe`: another recipe is marked for this run, like a keyword trigger.
 */
export type DecisionAction
  = | { kind: 'reply' }
    | { kind: 'stay-quiet' }
    | { kind: 'hint', text: string }
    | { kind: 'recipe', recipeId: string }

/** When a recipe starts on its own. Without triggers, only the conversation run chooses it. */
export type RecipeTrigger
  = | { kind: 'keyword', keywords: string[] }
    | { kind: 'schedule', everyMinutes: number }
    | { kind: 'event', source: string }
    | { kind: 'idle', afterMinutes: number }
    | { kind: 'mood', feeling: MoodDimension, above: number }

/** One recipe. The user, a built-in default, or a model proposal can supply it. */
export interface Recipe {
  id: string
  name: string
  /** When the recipe fits. The conversation model reads it to choose. */
  description: string
  style: RecipeStyle
  triggers: RecipeTrigger[]
  source: 'builtin' | 'user' | 'model'
  enabled: boolean
  /**
   * The user authorized this recipe once. Later uses need no prompt.
   * A model proposal waits unauthorized until the user approves it.
   */
  approved: boolean
}

/** Id of the built-in recipe that lets a run read a message and stay quiet. */
export const STAY_QUIET_RECIPE_ID = 'builtin:stay-quiet'

/** Recipes that every host starts with. The user can turn them off. */
export const BUILTIN_RECIPES: readonly Recipe[] = [
  {
    id: STAY_QUIET_RECIPE_ID,
    name: 'Read without replying',
    description: 'Lets the character read a message and choose not to answer when nothing needs saying.',
    style: { kind: 'instructions', instructions: '', tools: ['builtIn_stayQuiet'] },
    triggers: [],
    source: 'builtin',
    enabled: true,
    approved: true,
  },
]

/** Recipes that may run now: enabled and authorized. */
export function usableRecipes(recipes: readonly Recipe[]) {
  return recipes.filter(recipe => recipe.enabled && recipe.approved)
}

/**
 * Tools that a recipe may use in one run: the tools it names that the host granted.
 * A recipe never adds a capability. Its tools only narrow what the envelope already allows.
 */
export function recipeTools(recipe: Recipe, granted: readonly string[]) {
  const named = recipe.style.kind === 'instructions' || recipe.style.kind === 'run' ? recipe.style.tools ?? [] : []
  return named.filter(tool => granted.includes(tool))
}

/** Usable recipes whose keyword trigger appears in the text. Matching ignores letter case. */
export function matchKeywordRecipes(recipes: readonly Recipe[], text: string) {
  const lower = text.toLowerCase()
  return usableRecipes(recipes).filter(recipe => recipe.triggers.some(trigger => trigger.kind === 'keyword'
    && trigger.keywords.some(keyword => keyword.trim() && lower.includes(keyword.trim().toLowerCase()))))
}

/** Usable recipes in the decision style. */
export function decisionRecipes(recipes: readonly Recipe[]) {
  return usableRecipes(recipes).filter(recipe => recipe.style.kind === 'decision')
}

/** One classifier request that asks every decision recipe about the message at once. */
export function recipeDecisionRequest(recipes: readonly Recipe[], message: string): ClassifierRequest {
  return {
    state: { task: 'Decide each question about the latest message to the character.' },
    untrusted: message,
    questions: Object.fromEntries(recipes.flatMap(recipe => recipe.style.kind === 'decision' ? [[recipe.id, recipe.style.question]] : [])),
  }
}

/**
 * The answer key of a confident answer: `true` or `false` for yes-or-no, the option for a choice, and the level index for a score.
 * An answer below the trust threshold has no key.
 */
export function decisionAnswerKey(answer: ClassifierAnswer | undefined, threshold: number): string | undefined {
  if (!answer)
    return undefined
  if (answer.type === 'noul')
    return noulConfidence(answer) >= threshold ? String(answer.noul >= 0.5) : undefined
  if (answer.confidence < threshold)
    return undefined
  return answer.type === 'choice' ? answer.choice : String(Math.round(answer.score))
}

/** What decision recipes did to one run. */
export interface RecipeDecisionOutcome {
  /** The recipe that chose silence. Silence wins over every other action. */
  silent?: { reason: string }
  /** Sentences that join the run's context. */
  hints: string[]
  /** Recipes that the decisions marked for the run. */
  recipeIds: string[]
  /** Names of the decision recipes whose answer changed the run. The reply shows them. */
  applied: string[]
}

/**
 * Applies the action of each confident answer. A missing or unsure answer does nothing, so the run replies.
 */
export function applyRecipeDecisions(recipes: readonly Recipe[], answers: Record<string, ClassifierAnswer> | undefined, threshold: number): RecipeDecisionOutcome {
  const outcome: RecipeDecisionOutcome = { hints: [], recipeIds: [], applied: [] }
  for (const recipe of recipes) {
    if (recipe.style.kind !== 'decision')
      continue
    const key = decisionAnswerKey(answers?.[recipe.id], threshold)
    const action = key === undefined ? undefined : recipe.style.actions[key]
    if (action?.kind === 'stay-quiet')
      outcome.silent ??= { reason: recipe.name }
    else if (action?.kind === 'hint' && action.text.trim())
      outcome.hints.push(action.text.trim())
    else if (action?.kind === 'recipe')
      outcome.recipeIds.push(action.recipeId)
    else
      continue
    outcome.applied.push(recipe.name)
  }
  return outcome
}
