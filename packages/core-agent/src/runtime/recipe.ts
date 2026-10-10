import type { Automation } from './automation'

/** A yes-or-no question. */
interface NoulQuestion {
  type: 'noul'
  instructions: string
  /** What yes and no mean. */
  criteria: { true: string, false: string }
}

/** Picks one named option. */
interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  /** Option name to its meaning. */
  criteria: Record<string, string>
}

/** Rates on an ordered scale. Level `0` is the lowest. */
interface ScoreQuestion {
  type: 'score'
  instructions: string
  /** Level meanings, lowest first. */
  criteria: string[]
}

/** The question of a decision: yes or no, one of some options, or a level on a scale. */
export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion

/**
 * What one answer of a decision does.
 * - `reply`: the character replies as usual.
 * - `stay-quiet`: the character reads the message and does not reply.
 * - `hint`: the character replies and keeps a sentence in mind.
 * - `recipe`: the character uses another recipe. It sets when a model-timed one runs.
 */
export type DecisionAction
  = | { kind: 'reply' }
    | { kind: 'stay-quiet' }
    | { kind: 'hint', text: string }
    | { kind: 'recipe', recipeId: string }

/**
 * A decision: one question about the owner's message, and the action of each answer.
 * A keyword of its recipe invokes it like any skill. The character picks one answer, and code picks what follows.
 */
export interface RecipeDecision {
  question: DecisionQuestion
  /** Answer key to action. The keys are `true` and `false`, the option names, or the level indexes. */
  actions: Record<string, DecisionAction>
}

/** A keyword in the owner's message that points to a conversation recipe. Without one, only the conversation run chooses the recipe. */
interface RecipeTrigger { kind: 'keyword', keywords: string[] }

/** One recipe. The user or a model proposal supplies it. */
export interface Recipe {
  id: string
  name: string
  /** When the recipe fits. The conversation model reads it to choose. */
  description: string
  /** The steps that the conversation or a background run follows. A decision recipe has none. */
  instructions: string
  /** A decision recipe asks this after its keyword appears in the owner's message, instead of giving steps. */
  decision?: RecipeDecision
  /** When the recipe runs on its own, without a message. Such a recipe always runs in its own session. */
  automation?: Automation
  /**
   * The model sets when the recipe runs, each time the owner's message invokes it by keyword.
   * Each automation that the model sets runs the recipe once in its own session. The owner approves what the recipe does, not each time.
   */
  modelTimed?: boolean
  triggers: RecipeTrigger[]
  source: 'user' | 'model'
  enabled: boolean
  /**
   * The user authorized this recipe once. Later uses need no prompt.
   * A model proposal waits unauthorized until the user approves it.
   */
  approved: boolean
  /**
   * The recipe runs as a task in its own session, and its result reaches the conversation later.
   * Without it, using the recipe gives its steps to the conversation, which follows them itself.
   */
  background?: boolean
}

/**
 * Instructions that let the model decide what each run does, from the recipe's purpose.
 * The editor writes them when the owner picks "the model decides", and Settings recognize them to show that choice. The runtime treats them as plain instructions.
 */
export const MODEL_DECIDES_STEPS = 'Decide what this run does from the recipe\'s purpose and what you know now, and use your tools to do it.'

/** Recipes that can run now: enabled and authorized. */
export function usableRecipes(recipes: readonly Recipe[]) {
  return recipes.filter(recipe => recipe.enabled && recipe.approved)
}

/** Whether a recipe runs on its own, without a message: on the owner's automation, or on one that the model sets. */
export function isAutoRunRecipe(recipe: Recipe) {
  return Boolean(recipe.automation?.triggers.length) || recipe.modelTimed === true
}

/** Whether a recipe runs in its own session. An auto-run recipe has no message to join, so it always does. */
export function isBackgroundRecipe(recipe: Recipe) {
  return recipe.background === true || isAutoRunRecipe(recipe)
}

/**
 * Usable recipes whose keyword trigger appears in the text. Matching ignores letter case.
 * A recipe with the owner's automation starts only on it, so a keyword never invokes it.
 * A keyword invokes a model-timed recipe, so the model can set when it runs.
 */
export function matchKeywordRecipes(recipes: readonly Recipe[], text: string) {
  const lower = text.toLowerCase()
  return usableRecipes(recipes).filter(recipe => !recipe.automation?.triggers.length && recipe.triggers.some(trigger => trigger.kind === 'keyword'
    && trigger.keywords.some(keyword => keyword.trim() && lower.includes(keyword.trim().toLowerCase()))))
}

/** One answer that the character can give: the id that it answers with, the action key, and what the answer means. */
export interface DecisionOption {
  id: string
  key: string
  meaning: string
}

/**
 * The answers of a decision in order: yes then no, the options, or the levels from low to high.
 * The character answers with the id: `yes` or `no`, an option number from 1, or a level number from 0.
 */
export function decisionOptions(question: DecisionQuestion): DecisionOption[] {
  if (question.type === 'noul')
    return [{ id: 'yes', key: 'true', meaning: question.criteria.true }, { id: 'no', key: 'false', meaning: question.criteria.false }]
  if (question.type === 'choice')
    return Object.entries(question.criteria).map(([key, meaning], index) => ({ id: String(index + 1), key, meaning }))
  return question.criteria.map((meaning, index) => ({ id: String(index), key: String(index), meaning }))
}

/**
 * Picks what follows the character's answer. The character commits to one answer, and code picks its action.
 * A decision has no unsure answer, so every judgment leads to the action of the answer that the character chose.
 *
 * Returns:
 * - The answered option and its action. Without an action, the character replies as usual.
 * - An error text for an answer that the decision does not have, so the character can fix its call.
 */
export function judgeDecision(decision: RecipeDecision, answerId: string): { option: DecisionOption, action?: DecisionAction } | string {
  const options = decisionOptions(decision.question)
  const option = options.find(entry => entry.id === answerId.trim())
  if (!option)
    return `The answer must be one of: ${options.map(entry => entry.id).join(', ')}.`
  const action = decision.actions[option.key]
  return { option, ...(action ? { action } : {}) }
}
