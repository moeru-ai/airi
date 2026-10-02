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
    | { kind: 'event', source: string, cooldownMinutes: number }
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
  /**
   * The recipe takes over the conversation as its own persona, for example a way of talking, and hands back when it ends.
   * Without it, the recipe runs a task in its own session and returns a result to the conversation.
   */
  handover?: boolean
  /**
   * A yes-or-no question for an auto-run recipe. When its trigger fires, the classifier answers it first, and a confident no skips the run.
   * For example, "Is it late at night and the owner seems away?"
   */
  gate?: string
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

/** Whether a recipe starts on its own, without a message: any trigger other than a keyword. */
export function isAutoRunRecipe(recipe: Recipe) {
  return recipe.triggers.some(trigger => trigger.kind !== 'keyword')
}

/** What the scheduler knows when it checks auto-run triggers. */
export interface RecipeTriggerState {
  now: number
  /** When the scheduler started checking. A trigger never counts time before it. */
  startedAt: number
  /** The owner's last message in the active owner session. */
  lastOwnerMessageAt?: number
  /** When each recipe last started on its trigger. */
  firedAt: Readonly<Record<string, number>>
  /** The latest observation from each registered source that the owner scene can read, by source key. */
  observations?: Readonly<Record<string, { createdAt: number, text: string }>>
}

/** A recipe whose trigger fired, with the observation that fired an event trigger. */
export interface DueRecipe {
  recipe: Recipe
  trigger: RecipeTrigger
  observation?: { source: string, text: string }
}

/**
 * Usable auto-run recipes with steps whose trigger is due.
 * An idle trigger fires once per owner silence, so it waits for the owner to speak before it fires again.
 * A schedule trigger fires each period. An event trigger fires on a newer observation from its source, at most once per cooldown.
 * Observations from before the scheduler started never fire. Mood triggers are not checked here.
 */
export function dueTriggeredRecipes(recipes: readonly Recipe[], state: RecipeTriggerState): DueRecipe[] {
  const minute = 60_000
  return usableRecipes(recipes).flatMap((recipe): DueRecipe[] => {
    if (recipe.style.kind !== 'instructions' || !recipe.style.instructions.trim())
      return []
    const firedAt = state.firedAt[recipe.id]
    for (const trigger of recipe.triggers) {
      if (trigger.kind === 'idle' && trigger.afterMinutes > 0) {
        const silentSince = Math.max(state.lastOwnerMessageAt ?? state.startedAt, state.startedAt)
        if (state.now - silentSince >= trigger.afterMinutes * minute && (firedAt === undefined || firedAt < silentSince))
          return [{ recipe, trigger }]
      }
      if (trigger.kind === 'schedule' && trigger.everyMinutes > 0 && state.now - (firedAt ?? state.startedAt) >= trigger.everyMinutes * minute)
        return [{ recipe, trigger }]
      if (trigger.kind === 'event') {
        const observation = state.observations?.[trigger.source]
        const cooled = firedAt === undefined || state.now - firedAt >= Math.max(0, trigger.cooldownMinutes) * minute
        if (observation && observation.createdAt > (firedAt ?? state.startedAt) && cooled)
          return [{ recipe, trigger, observation: { source: trigger.source, text: observation.text } }]
      }
    }
    return []
  })
}

/**
 * One classifier request that asks the gate of each due recipe at once. Recipes without a gate are not asked.
 * The state is the scene that the scheduler sees, such as the time and the owner's silence.
 */
export function recipeGateRequest(recipes: readonly Recipe[], state: string): ClassifierRequest {
  return {
    state: { task: 'Decide for each question whether its recipe should run now.', scene: state },
    questions: Object.fromEntries(recipes.flatMap(recipe => recipe.gate?.trim()
      ? [[recipe.id, { type: 'noul', instructions: recipe.gate.trim(), criteria: { true: 'Run it now.', false: 'Not now.' } } satisfies ClassifierQuestion]]
      : [])),
  }
}

/**
 * Due recipes that pass their gate. A recipe without a gate passes.
 * Without answers, for example without a classifier, every recipe passes, because the owner set its trigger.
 * With answers, only a confident yes passes, so an unsure gate saves the run.
 */
export function passGates(recipes: readonly Recipe[], answers: Record<string, ClassifierAnswer> | undefined, threshold: number) {
  if (!answers)
    return [...recipes]
  return recipes.filter((recipe) => {
    if (!recipe.gate?.trim())
      return true
    return decisionAnswerKey(answers[recipe.id], threshold) === 'true'
  })
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
