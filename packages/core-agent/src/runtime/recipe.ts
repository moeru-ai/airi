import type { MoodDimension } from './mood'

/**
 * How a recipe works. A recipe is one way to handle a kind of task, and its style says how it runs.
 *
 * - `instructions`: guidance and tools that the conversation run uses when it judges them fitting.
 * - `decision`: one classifier question whose answer decides the outcome without text generation.
 * - `run`: a child run that the scheduler starts with its own envelope.
 * - `mcp`: one call to a configured MCP tool.
 */
export type RecipeStyle
  = | { kind: 'instructions', instructions: string, tools?: string[] }
    | { kind: 'decision', question: string, yesMeans: string, noMeans: string, onYes: 'stay-quiet' }
    | { kind: 'run', instructions: string, tools?: string[] }
    | { kind: 'mcp', server: string, tool: string }

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
